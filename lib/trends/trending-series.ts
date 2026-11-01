/**
 * 「いま伸びている話題」の集計の純粋な関数（DB を使わない）。
 *
 * 集計の SQL（trending-keywords.ts）は、タグ別に、集計の時刻から遡る 24 時間ごとの 7 区間の
 * 件数を返す（区間 0 = 直近 24 時間、区間 6 = 6〜7 日前）。ここで区間を 0 で埋め、成長率と
 * 急上昇の判定をし、並べる。一覧の件数と折れ線の最後の点は同じ行から作るので食い違わない。
 */

/** 区間の数（直近 24 時間＋前の 6 日） */
export const TREND_BUCKET_COUNT = 7;

export interface TrendingKeyword {
  id: string;
  name: string;
  /** 直近 24 時間の件数 */
  recentCount: number;
  /** 前の 6 日（7 日前〜24 時間前）の1日平均。成長率の分母は 1.0 に切り上げるが、ここは切り上げる前の値（小数 1 桁） */
  weeklyAverage: number;
  growthRate: number;
  isTrending: boolean;
}

export interface TrendingKeywordWithSeries extends TrendingKeyword {
  /** 24 時間ごとの 7 区間の件数。古い順（先頭が 6〜7 日前、末尾が直近 24 時間 = recentCount） */
  series: number[];
}

/** 集計の SQL の1行（タグ × 区間） */
export interface TagBucketRow {
  id: string;
  name: string;
  /** 0 = 直近 24 時間 … 6 = 6〜7 日前 */
  bucket: number;
  count: number;
}

/**
 * 成長率と急上昇の判定。直近 24 時間の件数を、前の 6 日の1日平均と比べる。
 * 1日平均が 1.0 未満のときは 1.0 として割る（極小の分母で成長率が膨らむのを防ぐ。0 も同じ扱い）。
 * 成長率は 999% で打ち切る。急上昇は、成長率が 50% を超え、直近 24 時間に 2 件以上あるもの
 */
export function scoreTrend(
  recentCount: number,
  previousSixDaysCount: number
): Pick<TrendingKeyword, 'weeklyAverage' | 'growthRate' | 'isTrending'> {
  const weeklyAverage = previousSixDaysCount / 6;
  const effectiveAverage = Math.max(weeklyAverage, 1.0);
  const rawGrowthRate =
    ((recentCount - effectiveAverage) / effectiveAverage) * 100;
  const growthRate = Math.min(Math.round(rawGrowthRate), 999);
  return {
    weeklyAverage: Math.round(weeklyAverage * 10) / 10,
    growthRate,
    isTrending: growthRate > 50 && recentCount >= 2,
  };
}

/** 成長率の高い順、同じなら直近の件数の多い順。残りの同順位は名前と ID の順で決める */
export function compareTrending(a: TrendingKeyword, b: TrendingKeyword) {
  return (
    b.growthRate - a.growthRate ||
    b.recentCount - a.recentCount ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface TrendingSeriesResult {
  /** 急上昇（isTrending）のタグだけ。並べた上位 limit 件 */
  trending: TrendingKeywordWithSeries[];
  /** 急上昇のタグの総数（limit で打ち切る前） */
  trendingTotal: number;
}

/**
 * タグ × 区間の行から、急上昇のタグの一覧（区間の件数つき）と総数を作る。
 * 範囲外の区間（0〜6 以外）の行は捨てる
 */
export function buildTrendingSeries(
  rows: readonly TagBucketRow[],
  limit: number
): TrendingSeriesResult {
  const tags = new Map<string, { name: string; buckets: number[] }>();
  for (const row of rows) {
    if (
      !Number.isInteger(row.bucket) ||
      row.bucket < 0 ||
      row.bucket >= TREND_BUCKET_COUNT
    ) {
      continue;
    }
    let tag = tags.get(row.id);
    if (!tag) {
      tag = {
        name: row.name,
        buckets: new Array<number>(TREND_BUCKET_COUNT).fill(0),
      };
      tags.set(row.id, tag);
    }
    tag.buckets[row.bucket] += Number(row.count);
  }

  const trending: TrendingKeywordWithSeries[] = [];
  for (const [id, { name, buckets }] of tags) {
    const recentCount = buckets[0];
    const previousSixDaysCount = buckets
      .slice(1)
      .reduce((sum, count) => sum + count, 0);
    const score = scoreTrend(recentCount, previousSixDaysCount);
    if (!score.isTrending) continue;
    trending.push({
      id,
      name,
      recentCount,
      ...score,
      series: [...buckets].reverse(),
    });
  }
  trending.sort(compareTrending);

  return {
    trending: trending.slice(0, limit),
    trendingTotal: trending.length,
  };
}
