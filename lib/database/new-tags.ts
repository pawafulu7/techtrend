import { Prisma, type PrismaClient } from '@/lib/prisma-exports';
import { articleAggregationSql } from './article-aggregation-filter';

/** 初めて公開集計の対象になったタグ。非表示・無効ソースの過去記事は初出とみなさない。 */
export async function findNewTags(
  db: Pick<PrismaClient, '$queryRaw'>,
  { from, to, limit }: { from: Date; to: Date; limit?: number }
): Promise<{ id: string; name: string; count: number }[]> {
  const rows = await db.$queryRaw<
    { id: string; name: string; count: bigint }[]
  >`
    SELECT t.id, t.name, COUNT(DISTINCT a.id) AS count
    FROM "Tag" t
    JOIN "_ArticleToTag" at ON t.id = at."B"
    JOIN "Article" a ON at."A" = a.id
    WHERE ${articleAggregationSql('a', { from, to })}
      AND t.name <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "_ArticleToTag" at2
        JOIN "Article" a2 ON at2."A" = a2.id
        WHERE at2."B" = t.id
          AND ${articleAggregationSql('a2', { to: from })}
      )
    GROUP BY t.id, t.name
    ORDER BY count DESC, t.id ASC
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `;
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}
