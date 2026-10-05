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

/** 同じストーリーとみなす要約の類似度（cosine）の下限 */
export const STORY_SIMILARITY_THRESHOLD = 0.85;
/** 同じストーリーとみなす公開日の差の上限（時間） */
export const STORY_MAX_GAP_HOURS = 72;
/** まとめ直す対象の期間（日）。これより古い記事のまとめは変えない */
export const STORY_WINDOW_DAYS = 7;

export interface StoryCandidate {
  id: string;
  title: string;
  qualityScore: number;
  publishedAt: Date;
}

export interface StoryAssignmentResult {
  candidates: number;
  pairs: number;
  stories: number;
  groupedArticles: number;
  changed: number;
  dryRun: boolean;
  groups: StoryCandidate[][];
}

// かな・漢字を含むタイトルを日本語の記事とみなす（英語の記事は title が原文で、訳は translatedTitle）
const JAPANESE_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export function isJapaneseTitle(title: string): boolean {
  return JAPANESE_PATTERN.test(title);
}

/**
 * 代表の記事を選ぶ。日本語の記事を優先し、その中で品質スコアの高いもの。
 * 同点なら公開の早いもの、それも同じなら ID の小さいもの（実行ごとに代表が揺れないように）
 */
export function compareStoryRepresentative(
  a: StoryCandidate,
  b: StoryCandidate
): number {
  const ja =
    Number(isJapaneseTitle(b.title)) - Number(isJapaneseTitle(a.title));
  if (ja !== 0) return ja;
  if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
  const time = a.publishedAt.getTime() - b.publishedAt.getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function pickStoryRepresentative(
  members: StoryCandidate[]
): StoryCandidate {
  return [...members].sort(compareStoryRepresentative)[0];
}

/**
 * 類似した組をつないで、2件以上の記事からなるグループに分ける（union-find）
 */
export function groupStoryPairs(
  pairs: Array<{ a: string; b: string }>
): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) {
      root = parent.get(root) ?? root;
    }
    // 経路を縮める
    let node = x;
    while (node !== root) {
      const next = parent.get(node) ?? node;
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
  const since = new Date(
    now.getTime() - STORY_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  // 期間内の全記事（非表示・無効なソースも含む。まとめから外すときに storyId を消すため）
  const candidates = await db.article.findMany({
    where: { publishedAt: { gte: since } },
    select: {
      id: true,
      title: true,
      qualityScore: true,
      publishedAt: true,
      storyId: true,
    },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // 一覧に出る記事（非表示でなく、有効なソース）同士の組だけを取る
  const pairs = await db.$queryRaw<Array<{ a: string; b: string }>>`
    WITH w AS (
      SELECT a.id, a."publishedAt" AS p, e.embedding
      FROM "Article" a
      INNER JOIN "Source" s ON s.id = a."sourceId" AND s.enabled = true
      INNER JOIN "ArticleEmbedding" e
        ON e."articleId" = a.id
        AND e."embeddingKey" = 'summary'::"EmbeddingKey"
        AND e.model = ${env.RAG_ACTIVE_MODEL}
        AND e.version = ${env.RAG_ACTIVE_VERSION}
      WHERE a."publishedAt" >= ${since}
        AND a."isHidden" = false
    )
    SELECT x.id AS a, y.id AS b
    FROM w x
    INNER JOIN w y
      ON x.id < y.id
      AND y.p BETWEEN x.p - make_interval(hours => ${STORY_MAX_GAP_HOURS})
                  AND x.p + make_interval(hours => ${STORY_MAX_GAP_HOURS})
    WHERE (x.embedding <=> y.embedding) <= ${1 - STORY_SIMILARITY_THRESHOLD}
  `;

  const groups = groupStoryPairs(pairs)
    .map((ids) => ids.map((id) => byId.get(id)).filter((c) => c !== undefined))
    .filter((members) => members.length > 1);

  const desired = new Map<string, string>();
  for (const members of groups) {
    const representative = pickStoryRepresentative(members);
    for (const member of members) desired.set(member.id, representative.id);
  }

  // 変わる記事だけを、まとめ先ごとに書き込む
  const updates = new Map<string | null, string[]>();
  for (const candidate of candidates) {
    const next = desired.get(candidate.id) ?? null;
    if (candidate.storyId === next) continue;
    const ids = updates.get(next);
    if (ids) ids.push(candidate.id);
    else updates.set(next, [candidate.id]);
  }
  const changed = [...updates.values()].reduce((n, ids) => n + ids.length, 0);

  if (!dryRun) {
    await db.$transaction(async (tx) => {
      for (const [storyId, ids] of updates) {
        await tx.$executeRaw`
          UPDATE "Article"
          SET "storyId" = ${storyId}, "storySize" = NULL
          WHERE id = ANY(${ids}::text[])
        `;
      }
      // 件数を数え直す。期間の外に残った記事だけになったストーリーは解く
      await tx.$executeRaw`
        WITH c AS (
          SELECT "storyId", COUNT(*)::int AS n
          FROM "Article"
          WHERE "storyId" IS NOT NULL
          GROUP BY "storyId"
        )
        UPDATE "Article" a
        SET "storySize" = CASE WHEN c.n > 1 THEN c.n END,
            "storyId" = CASE WHEN c.n > 1 THEN a."storyId" END
        FROM c
        WHERE a."storyId" = c."storyId"
          AND (a."storySize" IS DISTINCT FROM c.n OR c.n <= 1)
      `;
    });
  }

  return {
    candidates: candidates.length,
    pairs: pairs.length,
    stories: groups.length,
    groupedArticles: desired.size,
    changed,
    dryRun,
    groups,
  };
}
