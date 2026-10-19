import type { PrismaClient } from '@/lib/prisma-exports';
import { daysAgo } from './article-aggregation-filter';
import { homeArticleSql } from './home-article-filter';
import {
  TREND_BUCKET_COUNT,
  type TagBucketRow,
} from '@/lib/services/trending-series';

/**
 * ホームに出る記事を、タグ別・24 時間ごとの区間別に数える（1 回の問い合わせ）。
 *
 * 区間 k は [now − (k+1)×24h, now − k×24h)（k = 0〜6）。期間の条件（[from, to)）と同じく、
 * ちょうど 24 時間前の記事は区間 0 に入る。件数の無い区間の行は返さない（0 で埋めるのは
 * buildTrendingSeries）。(A, B) が主キーなので「タグ × 記事」は一意で、DISTINCT は要らない
 */
export async function countTagsByDayBucket(
  db: Pick<PrismaClient, '$queryRaw'>,
  { now }: { now: Date }
): Promise<TagBucketRow[]> {
  return db.$queryRaw<TagBucketRow[]>`
    SELECT
      t.id,
      t.name,
      (CEIL(EXTRACT(EPOCH FROM (${now.toISOString()}::timestamptz - a."publishedAt")) / 86400) - 1)::int AS bucket,
      COUNT(*)::int AS count
    FROM "Article" a
    JOIN "_ArticleToTag" at ON at."A" = a.id
    JOIN "Tag" t ON t.id = at."B"
    WHERE ${homeArticleSql({ from: daysAgo(TREND_BUCKET_COUNT, now), to: now })}
      AND t.name <> ''
    GROUP BY 1, 2, 3
  `;
}
