/**
 * タグごとの記事数を、有効なソースの記事だけで数える（issue #688）。
 *
 * Prisma の `orderBy: { articles: { _count: 'desc' } }` には where を付けられないので、
 * `_count` の select に条件を入れても並び順と上位 N 件は直らない。上位の選定はここの生 SQL で行う。
 *
 * 全期間の件数は「全件数 − 無効なソースの記事の件数」の形で数える。無効なソースの記事が少ないうちは
 * Article を結んで数える形より速いため（開発 DB の全期間の上位 50 件で、この形 116ms・結ぶ形 154〜180ms）。
 * 大きなソースを無効にすると逆転する（全記事の 20% を無効にした模擬で、この形 256ms・結ぶ形 140〜169ms。
 * それでも Prisma の `_count` の形の約 353ms より速い）。無効な記事が増えたら、結ぶ形への切り替えを検討する。
 * 今までの Prisma の `_count` と同じく、非表示（`isHidden`）の記事も数える。
 */
import type { PrismaClient } from '@/lib/prisma-exports';
import { Prisma } from '@/lib/prisma-exports';
import { escapeLikePattern } from '@/lib/utils/like-pattern';
import { disabledSourceSql, enabledSourceSql } from './enabled-source-filter';

type RawQueryClient = Pick<PrismaClient, '$queryRaw'>;

export interface TopTag {
  id: string;
  name: string;
  category: string | null;
  /** 全期間の記事数（有効なソースの記事だけ） */
  count: number;
  /** `activeSince` 以降の記事数（有効なソースの記事だけ）。`activeSince` を渡したときだけ入る */
  periodCount?: number;
}

export interface TopTagsOptions {
  limit: number;
  /** 名前の部分一致（大文字小文字を区別しない）。LIKE のワイルドカードはここでエスケープする */
  nameContains?: string;
  /** この日時以降に有効なソースの記事があるタグだけに絞り、その期間の件数も返す */
  activeSince?: Date;
}

/**
 * 全期間の記事数（有効なソースの記事だけ）の多い順に、上位 `limit` 件のタグを返す。
 * 記事が 0 件のタグは返さない。同数のときは ID の順（今までの Prisma の並びは、同数の順が決まっていなかった）。
 * `activeSince` を渡すと、その日時以降に有効なソースの記事があるタグだけに絞ったうえで、全期間の件数で上位を選ぶ
 */
export async function findTopTags(
  db: RawQueryClient,
  { limit, nameContains, activeSince }: TopTagsOptions
): Promise<TopTag[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit must be a positive integer: ${limit}`);
  }
  const nameCondition =
    nameContains !== undefined
      ? Prisma.sql`AND t.name ILIKE ${`%${escapeLikePattern(nameContains)}%`}`
      : Prisma.empty;

  if (activeSince) {
    // tag_totals は period_counts で絞らない。絞ると period_counts の行ごとに索引を引く
    // Nested Loop になり、365 日で約 2 倍遅くなる（後ろの JOIN で同じ行に絞られる）
    const rows = await db.$queryRaw<
      {
        id: string;
        name: string;
        category: string | null;
        count: number;
        period_count: number;
      }[]
    >`
      WITH period_counts AS (
        SELECT at."B" AS tag_id, COUNT(*) AS period_count
        FROM "_ArticleToTag" at
        JOIN "Article" a ON a.id = at."A"
        WHERE a."publishedAt" >= ${activeSince.toISOString()}::timestamptz
          AND ${enabledSourceSql()}
        GROUP BY at."B"
      ),
      tag_totals AS (
        SELECT at."B" AS tag_id, COUNT(*) AS total
        FROM "_ArticleToTag" at
        GROUP BY at."B"
      ),
      disabled_counts AS (
        SELECT at."B" AS tag_id, COUNT(*) AS disabled
        FROM "_ArticleToTag" at
        JOIN "Article" a ON a.id = at."A"
        WHERE ${disabledSourceSql()}
          AND at."B" IN (SELECT tag_id FROM period_counts)
        GROUP BY at."B"
      )
      SELECT
        t.id,
        t.name,
        t.category,
        (tt.total - COALESCE(dc.disabled, 0))::int AS count,
        pc.period_count::int AS period_count
      FROM period_counts pc
      JOIN tag_totals tt ON tt.tag_id = pc.tag_id
      JOIN "Tag" t ON t.id = pc.tag_id
      LEFT JOIN disabled_counts dc ON dc.tag_id = pc.tag_id
      WHERE tt.total - COALESCE(dc.disabled, 0) > 0 ${nameCondition}
      ORDER BY count DESC, t.id ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      count: Number(row.count),
      periodCount: Number(row.period_count),
    }));
  }

  const rows = await db.$queryRaw<
    { id: string; name: string; category: string | null; count: number }[]
  >`
    WITH tag_totals AS (
      SELECT at."B" AS tag_id, COUNT(*) AS total
      FROM "_ArticleToTag" at
      GROUP BY at."B"
    ),
    disabled_counts AS (
      SELECT at."B" AS tag_id, COUNT(*) AS disabled
      FROM "_ArticleToTag" at
      JOIN "Article" a ON a.id = at."A"
      WHERE ${disabledSourceSql()}
      GROUP BY at."B"
    )
    SELECT t.id, t.name, t.category, (tt.total - COALESCE(dc.disabled, 0))::int AS count
    FROM tag_totals tt
    JOIN "Tag" t ON t.id = tt.tag_id
    LEFT JOIN disabled_counts dc ON dc.tag_id = tt.tag_id
    WHERE tt.total - COALESCE(dc.disabled, 0) > 0 ${nameCondition}
    ORDER BY count DESC, t.id ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    count: Number(row.count),
  }));
}

/**
 * 指定したタグについて、`[from, to)` に公開された有効なソースの記事数を返す。
 * 記事の無いタグは Map に入らない
 */
export async function countTagArticlesInRange(
  db: RawQueryClient,
  tagIds: string[],
  { from, to }: { from: Date; to: Date }
): Promise<Map<string, number>> {
  if (tagIds.length === 0) return new Map();

  const rows = await db.$queryRaw<{ tag_id: string; count: number }[]>`
    SELECT at."B" AS tag_id, COUNT(*)::int AS count
    FROM "_ArticleToTag" at
    JOIN "Article" a ON a.id = at."A"
    WHERE at."B" = ANY(${tagIds}::text[])
      AND a."publishedAt" >= ${from.toISOString()}::timestamptz
      AND a."publishedAt" < ${to.toISOString()}::timestamptz
      AND ${enabledSourceSql()}
    GROUP BY at."B"
  `;
  return new Map(rows.map((row) => [row.tag_id, Number(row.count)]));
}
