import { daysAgo } from '@/lib/database/article-aggregation-filter';
import { findNewTags } from '@/lib/database/new-tags';
import { countTagsByDayBucket } from '@/lib/database/tag-day-buckets';
import { prisma } from '@/lib/prisma';
import {
  keywordsCache,
  TRENDING_SERIES_CACHE_KEY,
} from '@/lib/cache/keywords-cache';
import {
  buildTrendingSeries,
  type TrendingKeyword,
  type TrendingKeywordWithSeries,
} from '@/lib/services/trending-series';

export type {
  TrendingKeyword,
  TrendingKeywordWithSeries,
} from '@/lib/services/trending-series';

export interface NewTag {
  id: string;
  name: string;
  count: number;
}

/** キャッシュに載せる急上昇のタグの数（トレンド概要の一覧の上位 20 件。ホームの帯は先頭の 6 件を使う） */
const TRENDING_LIMIT = 20;

/**
 * 「いま伸びている話題」の集計。ホーム（帯）・トレンド概要・/api/trends/keywords が同じ値を使う
 */
export interface TrendingSeries {
  /** 急上昇のタグ（成長率 50% 超かつ 2 件以上）の上位 20 件。7 区間の件数つき */
  trending: TrendingKeywordWithSeries[];
  /** 急上昇のタグの総数 */
  trendingTotal: number;
  /** 直近 24 時間に初めて集計の対象になったタグ */
  newTags: NewTag[];
  /** 直近 24 時間の区間。to が集計した時刻 */
  period: { from: string; to: string };
}

async function loadTrendingSeries(): Promise<TrendingSeries> {
  const now = new Date();
  const oneDayAgo = daysAgo(1, now);

  const [rows, newTags] = await Promise.all([
    countTagsByDayBucket(prisma, { now }),
    // 新規タグ（過去24時間に初めて使われたタグ）
    findNewTags(prisma, { from: oneDayAgo, to: now, limit: 10 }),
  ]);

  const { trending, trendingTotal } = buildTrendingSeries(rows, TRENDING_LIMIT);

  return {
    trending,
    trendingTotal,
    newTags: newTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: tag.count,
    })),
    period: {
      from: oneDayAgo.toISOString(),
      to: now.toISOString(),
    },
  };
}

/** 急上昇の一覧・区間の件数・総数・新着タグを1つの値として取る（Redis にキャッシュ） */
export function getTrendingSeries(): Promise<TrendingSeries> {
  return keywordsCache.getOrSetWithLock(
    TRENDING_SERIES_CACHE_KEY,
    loadTrendingSeries
  );
}

/** /api/trends/keywords とトレンド概要の形（区間の件数を除く）。getTrendingSeries と同じ値から作る */
export async function getTrendingKeywords(): Promise<{
  trending: TrendingKeyword[];
  newTags: NewTag[];
  period: { from: string; to: string };
}> {
  const { trending, newTags, period } = await getTrendingSeries();
  return {
    trending: trending.map(({ series: _series, ...keyword }) => keyword),
    newTags,
    period,
  };
}
