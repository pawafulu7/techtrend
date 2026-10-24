import { daysAgo } from '@/lib/database/article-aggregation-filter';
import { countTagsByDayBucket } from '@/lib/database/tag-day-buckets';
import { prisma } from '@/lib/prisma';
import {
  keywordsCache,
  TRENDING_SERIES_CACHE_KEY,
} from '@/lib/cache/keywords-cache';
import {
  buildTrendingSeries,
  type TrendingKeywordWithSeries,
} from '@/lib/services/trending-series';

export type {
  TrendingKeyword,
  TrendingKeywordWithSeries,
} from '@/lib/services/trending-series';

/** キャッシュに載せる急上昇のタグの数（トレンド概要の一覧の上位 20 件） */
const TRENDING_LIMIT = 20;

/**
 * 急上昇の話題の集計。トレンド概要が使う。
 * 数える記事はホームに出る記事（論文・技術以外・要約の無い記事を除く。話題を押した先のホームの一覧と同じ母集団）
 */
export interface TrendingSeries {
  /** 急上昇のタグ（成長率 50% 超かつ 2 件以上）の上位 20 件。7 区間の件数つき */
  trending: TrendingKeywordWithSeries[];
  /** 急上昇のタグの総数 */
  trendingTotal: number;
  /** 直近 24 時間の区間。to が集計した時刻 */
  period: { from: string; to: string };
}

async function loadTrendingSeries(): Promise<TrendingSeries> {
  const now = new Date();
  const oneDayAgo = daysAgo(1, now);

  const rows = await countTagsByDayBucket(prisma, { now });

  const { trending, trendingTotal } = buildTrendingSeries(rows, TRENDING_LIMIT);

  return {
    trending,
    trendingTotal,
    period: {
      from: oneDayAgo.toISOString(),
      to: now.toISOString(),
    },
  };
}

/** 急上昇の一覧・区間の件数・総数を1つの値として取る（Redis にキャッシュ） */
export function getTrendingSeries(): Promise<TrendingSeries> {
  return keywordsCache.getOrSetWithLock(
    TRENDING_SERIES_CACHE_KEY,
    loadTrendingSeries
  );
}
