import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RedisCache } from '@/lib/cache';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import logger from '@/lib/logger';
import {
  countTagArticlesInRange,
  findTopTags,
} from '@/lib/database/tag-article-counts';

// タグクラウド用のキャッシュを遅延初期化
let tagCloudCache: RedisCache | null = null;

const getTagCloudCache = () => {
  if (!tagCloudCache) {
    tagCloudCache = new RedisCache({
      ttl: 10800, // 3時間（30分から延長）
      namespace: '@techtrend/cache:tagcloud',
    });
  }
  return tagCloudCache;
};

async function tagCloudHandler(request: NextRequest) {
  try {
    // Next.js 15.xでのNextRequest対応
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const period = searchParams.get('period') || '30d';
    const validPeriods = ['7d', '30d', '365d', 'all'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period. Use: 7d, 30d, 365d, or all' },
        { status: 400 }
      );
    }
    const limit = Math.max(
      1,
      Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)
    );

    // キャッシュキーを生成
    const cache = getTagCloudCache();
    const cacheKey = cache.generateCacheKey('tagcloud', {
      params: { period, limit },
    });

    // キャッシュから取得を試みる
    try {
      const cachedResult = await cache.get(cacheKey);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
    } catch (cacheError) {
      // キャッシュエラーは無視して処理を続行
      logger.warn(
        { error: cacheError },
        'Cache error, continuing without cache'
      );
    }

    // 期間に基づいてフィルタリング
    const days =
      period === '7d'
        ? 7
        : period === '30d'
          ? 30
          : period === '365d'
            ? 365
            : null;
    const since = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;

    // タグの使用回数を取得。全期間の件数で上位を選んでから、期間内の件数で並べ直す。
    // 全期間・期間内・前期間の件数は、どれも無効化したソースの記事を数えない（issue #688）
    const topTags = await findTopTags(prisma, {
      limit,
      activeSince: since ?? undefined,
    });
    const tags = topTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: since ? (tag.periodCount ?? 0) : tag.count,
    }));

    // トレンド計算のために前期間のデータも取得
    let previousPeriodCounts = new Map<string, number>();
    if (period !== 'all') {
      const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 365;
      const previousStart = new Date();
      previousStart.setDate(previousStart.getDate() - periodDays * 2);
      const previousEnd = new Date();
      previousEnd.setDate(previousEnd.getDate() - periodDays);

      previousPeriodCounts = await countTagArticlesInRange(
        prisma,
        tags.map((t) => t.id),
        { from: previousStart, to: previousEnd }
      );
    }

    // レスポンスの構築
    const tagCloudData = tags
      .map((tag) => {
        const currentCount = tag.count;
        const previousCount = previousPeriodCounts.get(tag.id) ?? 0;

        let trend: 'rising' | 'stable' | 'falling' = 'stable';
        let growthRate = 0;
        if (period !== 'all') {
          if (previousCount === 0 && currentCount > 0) {
            trend = 'rising';
            growthRate = 100;
          } else if (previousCount === 0 && currentCount === 0) {
            // 両期間ともデータなし → stable / growthRate=0 のまま
          } else if (previousCount > 0) {
            growthRate = Math.round(
              ((currentCount - previousCount) / previousCount) * 100
            );
            if (currentCount > previousCount * 1.2) {
              trend = 'rising';
            } else if (currentCount < previousCount * 0.8) {
              trend = 'falling';
            }
          }
        }

        return {
          id: tag.id,
          name: tag.name,
          count: currentCount,
          trend,
          growthRate,
        };
      })
      .sort((a, b) => b.count - a.count); // 期間フィルタのカウントでソート

    const response = {
      tags: tagCloudData,
      period,
    };

    // キャッシュに保存
    try {
      await cache.set(cacheKey, response);
    } catch (cacheError) {
      // キャッシュ保存エラーは無視
      logger.warn(
        { error: cacheError },
        'Cache set error, continuing without caching'
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, 'API Error in /api/tags/cloud');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit('read:tags-cloud', tagCloudHandler);
