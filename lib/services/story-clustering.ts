/**
 * 同じ出来事の記事を1つのストーリーにまとめる（issue #723）
 *
 * 要約の埋め込みの類似度と公開日の近さで記事の組を作り、つながった記事を1つのストーリーにする。
 * ストーリーの ID は代表の記事の ID にする（一覧では代表の記事を1枚だけ出すため）。
 *
 * しきい値は開発 DB の1週間（2026-09-23〜30、2,622件）で決めた。0.85 で 31 ストーリー・
 * 誤り約3件、0.80 で 59 ストーリー・誤り約12件（連載の別の回などが混ざる）。続報や同じ製品の
 * 別の発表をまとめないよう、精度の高い 0.85 を使う。
 */
import type { PrismaClient } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';
import {
  isJapaneseTitle,
  pickStoryRepresentative,
} from '@/lib/utils/story-representative';

export {
  isJapaneseTitle,
  compareStoryRepresentative,
  pickStoryRepresentative,
} from '@/lib/utils/story-representative';

/** 同じストーリーとみなす要約の類似度（cosine）の下限 */
export const STORY_SIMILARITY_THRESHOLD = 0.85;
/** 同じストーリーとみなす公開日の差の上限（時間） */
export const STORY_MAX_GAP_HOURS = 72;
/**
 * まとめ直す対象の期間（日）。これより古い記事は、既にまとまっていれば書き換えない
 * （まだまとまっていなければ、期間内の記事と組になったときだけ同じストーリーに入れる）
 */
export const STORY_WINDOW_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;

export interface StoryCandidate {
  id: string;
  title: string;
  qualityScore: number;
  publishedAt: Date;
}

interface StoryRow extends StoryCandidate {
  storyId: string | null;
}

export interface StoryAssignmentResult {
  candidates: number;
  pairs: number;
  stories: number;
  groupedArticles: number;
  /** storyId を書き換えた記事の数 */
  changed: number;
  /** 件数の数え直しで storySize・storyId が変わった記事の数 */
  recounted: number;
  dryRun: boolean;
  /** 別の実行がまとめ直している最中で、何もしなかった */
  skipped: boolean;
  groups: Array<{ storyId: string; members: StoryCandidate[] }>;
}

// 同時に走ったバッチどうしが、互いの書き込みの前に読んだ値で差分を書いてストーリーを割らないよう、
// 読み取りから書き込みまでをこの番号のアドバイザリロックで1本に絞る
const STORY_LOCK_KEY = 723_723;

/**
 * 類似した組をつないで、2件以上の記事からなるグループに分ける（union-find）
 */
export function groupStoryPairs(
  pairs: Array<{ a: string; b: string }>
): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // 経路を縮める
    let node = x;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };

  for (const { a, b } of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** 最も多くの記事が持つ値（同数なら小さい方。実行ごとに揺れないように） */
function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && best !== null && value < best)
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * グループのストーリー ID を決める。
 * - 期間の外（書き換えない記事）が既にストーリーを持っていれば、それに合わせる
 *   （期間の境界をまたぐストーリーが割れたり解けたりしないように）
 * - 期間内の記事が既に同じグループの記事を代表にしていれば、それを据え置く。
 *   代表が実行ごとに入れ替わると、キャッシュ済みの一覧のページと新しいページで storyId が
 *   食い違い、同じストーリーが2枚に分かれるため。ただし日本語の記事が加わったときは、
 *   日本語を優先する規則に合わせて入れ替える
 * - どちらも無ければ、規則で代表を選ぶ
 */
export function chooseStoryId(
  members: StoryRow[],
  anchors: StoryRow[]
): string {
  const anchored = mostCommon(
    anchors.map((a) => a.storyId).filter((s): s is string => s !== null)
  );
  if (anchored) return anchored;

  const all = [...members, ...anchors];
  const best = pickStoryRepresentative(all);
  const byId = new Map(all.map((m) => [m.id, m]));
  const current = mostCommon(
    members
      .map((m) => m.storyId)
      .filter((s): s is string => s !== null && byId.has(s))
  );
  if (!current) return best.id;
  const currentArticle = byId.get(current)!;
  if (isJapaneseTitle(best.title) && !isJapaneseTitle(currentArticle.title)) {
    return best.id;
  }
  return current;
}

/**
 * 直近 STORY_WINDOW_DAYS 日の記事をまとめ直し、Article.storyId / storySize を書き込む。
 * updatedAt は変えない（updatedAt で再処理を拾うバッチがあるため、生 SQL で更新する）
 */
export async function assignStories(
  db: PrismaClient,
  options: { now?: Date; dryRun?: boolean } = {}
): Promise<StoryAssignmentResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  const since = new Date(now.getTime() - STORY_WINDOW_DAYS * 24 * HOUR_MS);
  // 期間の直前の記事も組の相手にする（境界をまたぐストーリーを保つため。書き換えはしない）
  const anchorSince = new Date(since.getTime() - STORY_MAX_GAP_HOURS * HOUR_MS);

  return db.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${STORY_LOCK_KEY}) AS locked
      `;
      if (!locked) {
        return {
          candidates: 0,
          pairs: 0,
          stories: 0,
          groupedArticles: 0,
          changed: 0,
          recounted: 0,
          dryRun,
          skipped: true,
          groups: [],
        };
      }

      // 期間内の全記事（非表示・無効なソースも含む。まとめから外すときに storyId を消すため）と、
      // 期間の直前の記事
      const rows: StoryRow[] = await tx.article.findMany({
        where: { publishedAt: { gte: anchorSince, lte: now } },
        select: {
          id: true,
          title: true,
          qualityScore: true,
          publishedAt: true,
          storyId: true,
        },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const inWindow = (r: StoryRow) => r.publishedAt >= since;
      const candidates = rows.filter(inWindow);

      // 今の埋め込みがある記事。まだ無い記事（生成待ち・モデルの切り替え中）は、似ていないのか
      // 比べられないのか分からないので、まとめを変えない
      const embedded = new Set(
        (
          await tx.$queryRaw<Array<{ articleId: string }>>`
            SELECT e."articleId"
            FROM "ArticleEmbedding" e
            INNER JOIN "Article" a ON a.id = e."articleId"
            WHERE e."embeddingKey" = 'summary'::"EmbeddingKey"
              AND e.model = ${env.RAG_ACTIVE_MODEL}
              AND e.version = ${env.RAG_ACTIVE_VERSION}
              AND a."publishedAt" >= ${since}
              AND a."publishedAt" <= ${now}
          `
        ).map((r) => r.articleId)
      );

      // 一覧に出る記事（非表示でなく、有効なソース）同士で、少なくとも片方が期間内の組だけを取る
      const pairs = await tx.$queryRaw<Array<{ a: string; b: string }>>`
        WITH w AS (
          SELECT a.id, a."publishedAt" AS p, e.embedding
          FROM "Article" a
          INNER JOIN "Source" s ON s.id = a."sourceId" AND s.enabled = true
          INNER JOIN "ArticleEmbedding" e
            ON e."articleId" = a.id
            AND e."embeddingKey" = 'summary'::"EmbeddingKey"
            AND e.model = ${env.RAG_ACTIVE_MODEL}
            AND e.version = ${env.RAG_ACTIVE_VERSION}
          WHERE a."publishedAt" >= ${anchorSince}
            AND a."publishedAt" <= ${now}
            AND a."isHidden" = false
        )
        SELECT x.id AS a, y.id AS b
        FROM w x
        INNER JOIN w y
          ON x.id < y.id
          AND y.p BETWEEN x.p - make_interval(hours => ${STORY_MAX_GAP_HOURS})
                      AND x.p + make_interval(hours => ${STORY_MAX_GAP_HOURS})
        WHERE GREATEST(x.p, y.p) >= ${since}
          AND (x.embedding <=> y.embedding) <= ${1 - STORY_SIMILARITY_THRESHOLD}
      `;

      const groups: StoryAssignmentResult['groups'] = [];
      const desired = new Map<string, string>();
      for (const ids of groupStoryPairs(pairs)) {
        const groupRows = ids
          .map((id) => byId.get(id))
          .filter((r): r is StoryRow => r !== undefined);
        const members = groupRows.filter(inWindow);
        if (members.length === 0 || groupRows.length < 2) continue;
        const anchors = groupRows.filter((r) => !inWindow(r));
        const storyId = chooseStoryId(members, anchors);
        groups.push({ storyId, members: groupRows });
        for (const member of members) desired.set(member.id, storyId);
        // 期間の外でまだまとまっていない記事も入れる（入れないと、期間内の記事が1件だけの
        // ストーリーになり、数え直しで解かれて、実行のたびに同じ書き込みを繰り返す）
        for (const anchor of anchors) {
          if (anchor.storyId === null) desired.set(anchor.id, storyId);
        }
      }

      // 変わる記事だけを書き込む
      const changedIds: string[] = [];
      const changedStoryIds: Array<string | null> = [];
      const anchorsToFill = rows.filter(
        (r) => !inWindow(r) && r.storyId === null && desired.has(r.id)
      );
      for (const candidate of [...candidates, ...anchorsToFill]) {
        const next = desired.get(candidate.id) ?? null;
        if (candidate.storyId === next) continue;
        if (next === null && !embedded.has(candidate.id)) continue;
        changedIds.push(candidate.id);
        changedStoryIds.push(next);
      }

      let recounted = 0;
      if (!dryRun) {
        if (changedIds.length > 0) {
          await tx.$executeRaw`
            UPDATE "Article" a
            SET "storyId" = u.story_id, "storySize" = NULL
            FROM unnest(${changedIds}::text[], ${changedStoryIds}::text[])
              AS u(id, story_id)
            WHERE a.id = u.id
          `;
        }
        // 一覧に出る記事（/api/stories/[id] と同じ条件）の数を数え直す。
        // 1件以下になったストーリーは解く
        recounted = await tx.$executeRaw`
          WITH c AS (
            SELECT a."storyId",
                   COUNT(*) FILTER (WHERE a."isHidden" = false AND s.enabled = true)::int AS n
            FROM "Article" a
            INNER JOIN "Source" s ON s.id = a."sourceId"
            WHERE a."storyId" IS NOT NULL
            GROUP BY a."storyId"
          )
          UPDATE "Article" a
          SET "storySize" = CASE WHEN c.n > 1 THEN c.n END,
              "storyId" = CASE WHEN c.n > 1 THEN a."storyId" END
          FROM c
          WHERE a."storyId" = c."storyId"
            AND (a."storySize" IS DISTINCT FROM c.n OR c.n <= 1)
        `;
      }

      return {
        candidates: candidates.length,
        pairs: pairs.length,
        stories: groups.length,
        groupedArticles: desired.size,
        changed: changedIds.length,
        recounted,
        dryRun,
        skipped: false,
        groups,
      };
    },
    // 本番（Neon）では組の検索だけで約21秒かかる（2026-10-05 に直近7日・約2,400件で計測）
    { timeout: 180_000, maxWait: 10_000 }
  );
}
