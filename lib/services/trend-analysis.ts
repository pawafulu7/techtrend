import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { trendsCache } from '@/lib/cache/trends-cache';
import { articleAggregationSql } from '@/lib/database/article-aggregation-filter';

/**
 * 日別のまとめの日付は日本時間の暦日（YYYY-MM-DD）にする。SQL の
 * `TO_CHAR(publishedAt AT TIME ZONE 'Asia/Tokyo', …)` と、0 で埋める日付（JS）の両方で同じ区切りを使う。
 * 以前は SQL がセッションのタイムゾーン、0 埋めが UTC で、セッションが UTC でないと両者がずれた
 */
// 日本時間は夏時間の無い固定の +9 時間なので、ずらして UTC の日付を読む（ICU のロケールの書式に頼らない）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDateKey(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** from から now までの日本時間の暦日（両端を含む、古い順） */
export function jstDateKeys(from: Date, now: Date): string[] {
  const dates: string[] = [];
  for (
    let t = from.getTime();
    t <= now.getTime();
    t += 24 * 60 * 60 * 1000
  ) {
    const key = jstDateKey(new Date(t));
    if (dates[dates.length - 1] !== key) dates.push(key);
  }
  const last = jstDateKey(now);
  if (dates[dates.length - 1] !== last) dates.push(last);
  return dates;
}

export interface TrendAnalysis {
  topTags: { name: string; totalCount: number }[];
  timeline: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  period: {
    from: string;
    to: string;
    days: number;
  };
}

export interface TagTrendAnalysis {
  tag: string;
  timeline: { date: string; count: number }[];
  relatedTags: { name: string; count: number }[];
  period: TrendAnalysis['period'];
}

async function loadTrendAnalysis(days: number, tagName?: string) {
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // 期間は [startDate, now)（ほかの集計と同じ決め方）。articleAggregationSql は ISO 文字列を ::timestamptz で
  // 読む（以前の ::timestamp はオフセットを捨て、セッションのタイムゾーンが UTC でないと時差の分ずれた）。
  // 上限を付け、未来の日時の記事を数えない
  const period = articleAggregationSql('a', { from: startDate, to: now });

  if (tagName) {
    // 特定タグの時系列データ
    const tagData = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          TO_CHAR(a."publishedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as date,
          COUNT(DISTINCT a.id) as count
        FROM "Tag" t
        JOIN "_ArticleToTag" at ON t.id = at."B"
        JOIN "Article" a ON at."A" = a.id
        WHERE lower(t.name) = lower(${tagName})
          AND ${period}
        GROUP BY 1
        ORDER BY date ASC
      `;

    // 関連タグを取得
    const relatedTags = await prisma.$queryRaw<
      { name: string; count: bigint }[]
    >`
        SELECT
          t2.name,
          COUNT(DISTINCT a.id) as count
        FROM "Tag" t1
        JOIN "_ArticleToTag" at1 ON t1.id = at1."B"
        JOIN "Article" a ON at1."A" = a.id
        JOIN "_ArticleToTag" at2 ON a.id = at2."A"
        JOIN "Tag" t2 ON at2."B" = t2.id
        WHERE lower(t1.name) = lower(${tagName})
          AND lower(t2.name) <> lower(${tagName})
          AND ${period}
        GROUP BY t2.name
        ORDER BY count DESC
        LIMIT 10
      `;

    return {
      tag: tagName,
      timeline: tagData.map((d) => ({
        date: d.date,
        count: Number(d.count),
      })),
      relatedTags: relatedTags.map((t) => ({
        name: t.name,
        count: Number(t.count),
      })),
      period: {
        from: startDate.toISOString(),
        to: now.toISOString(),
        days,
      },
    };
  } else {
    // 全体のトレンド分析
    const topTags = await prisma.$queryRaw<
      { name: string; total_count: bigint }[]
    >`
        SELECT
          t.name,
          COUNT(DISTINCT a.id) as total_count
        FROM "Tag" t
        JOIN "_ArticleToTag" at ON t.id = at."B"
        JOIN "Article" a ON at."A" = a.id
        WHERE ${period}
        GROUP BY t.name
        ORDER BY total_count DESC
        LIMIT 10
      `;

    // 上位タグの時系列データ
    let timelineData: { date: string; tag_name: string; count: bigint }[] = [];

    if (topTags.length > 0) {
      const tagNames = topTags.map((t) => t.name);
      timelineData = await prisma.$queryRaw<
        { date: string; tag_name: string; count: bigint }[]
      >`
          SELECT
            TO_CHAR(a."publishedAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as date,
            t.name as tag_name,
            COUNT(DISTINCT a.id) as count
          FROM "Tag" t
          JOIN "_ArticleToTag" at ON t.id = at."B"
          JOIN "Article" a ON at."A" = a.id
          WHERE ${period}
            AND t.name IN (${Prisma.join(tagNames)})
          GROUP BY 1, t.name
          ORDER BY date ASC, count DESC
        `;
    }

    // データを整形
    const timelineByDate = timelineData.reduce(
      (acc, item) => {
        const date = item.date;
        if (!acc[date]) {
          acc[date] = {};
        }
        acc[date][item.tag_name] = Number(item.count);
        return acc;
      },
      {} as Record<string, Record<string, number>>
    );

    // 全日付で全タグのデータを保証（日付は SQL と同じ日本時間の暦日）
    const dates = jstDateKeys(startDate, now);
    const tagNames = topTags.map((t) => t.name);

    const completeTimeline = dates.map((date) => {
      const dayData: Record<string, string | number> = { date };
      tagNames.forEach((tag) => {
        dayData[tag] = timelineByDate[date]?.[tag] || 0;
      });
      return dayData;
    });

    return {
      topTags: topTags.map((t) => ({
        name: t.name,
        totalCount: Number(t.total_count),
      })),
      timeline: completeTimeline,
      period: {
        from: startDate.toISOString(),
        to: now.toISOString(),
        days,
      },
    };
  }
}

export function getTrendAnalysis(days: number): Promise<TrendAnalysis>;
export function getTrendAnalysis(
  days: number,
  tag: string
): Promise<TagTrendAnalysis>;
export function getTrendAnalysis(
  days: number,
  tag?: string
): Promise<TrendAnalysis | TagTrendAnalysis>;
export function getTrendAnalysis(days: number, tag?: string) {
  const key = trendsCache.generateTrendsKey({ days, tag });
  return trendsCache.getOrSetWithLock(key, () => loadTrendAnalysis(days, tag));
}
