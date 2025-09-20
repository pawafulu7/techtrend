/**
 * Enhanced Favorite DataLoader with Two-Layer Cache
 * L1: Memory Cache (process-local, fast)
 * L2: Redis Cache (shared, persistent)
 * L3: Database (source of truth)
 */

import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';
import type { Favorite } from '@prisma/client';
import type { FavoriteStatus, LoaderOptions } from './types';
import { DataLoaderMemoryCache } from '../cache/memory-cache';
import { RedisCache } from '../cache/redis-cache';
import { getBatchOptimizer } from './batch-optimizer';
import logger from '../logger';

// グローバルキャッシュインスタンス（プロセス内共有）
let globalMemoryCache: DataLoaderMemoryCache | null = null;
let globalRedisCache: RedisCache | null = null;

// メトリクス収集
const stats = {
  l1Hits: 0,
  l2Hits: 0,
  dbQueries: 0,
  totalRequests: 0,
};

/**
 * キャッシュインスタンスの初期化
 */
function initializeCaches() {
  if (!globalMemoryCache) {
    globalMemoryCache = new DataLoaderMemoryCache();
  }
  if (!globalRedisCache) {
    globalRedisCache = new RedisCache({
      ttl: 60, // 1分
      namespace: '@techtrend/cache:favorites',
    });
  }
}

/**
 * お気に入り状態をバッチで取得するDataLoaderを作成
 * 二層キャッシュを使用して高速化
 *
 * @param userId - お気に入り状態を確認するユーザーのID
 * @param options - DataLoaderのオプション設定
 */
export function createFavoriteLoader(userId: string, options?: LoaderOptions) {
  initializeCaches();

  // バッチオプティマイザーを取得
  const optimizer = getBatchOptimizer('favorite');

  return new DataLoader<string, FavoriteStatus>(
    async (articleIds: readonly string[]) => {
      const startTime = Date.now();
      const queueStartTime = Date.now(); // キュー待ち時間計測用
      stats.totalRequests += articleIds.length;

      const results: FavoriteStatus[] = [];
      const l2CheckList: string[] = [];
      const dbCheckList: string[] = [];

      // Step 1: L1メモリキャッシュチェック
      for (const articleId of articleIds) {
        const cacheKey = `favorite:${userId}:${articleId}`;
        const cached = globalMemoryCache!.get(cacheKey);

        if (cached !== null) {
          stats.l1Hits++;
          results.push(cached as FavoriteStatus);
        } else {
          l2CheckList.push(articleId);
          results.push(null as any); // プレースホルダー
        }
      }

      // Step 2: L2 Redisキャッシュチェック（L1ミスのみ）
      if (l2CheckList.length > 0 && globalRedisCache) {
        const l2Results = await Promise.all(
          l2CheckList.map(async (articleId) => {
            const cacheKey = `favorite:${userId}:${articleId}`;
            try {
              const cached = await globalRedisCache!.get<FavoriteStatus>(cacheKey);
              if (cached) {
                stats.l2Hits++;
                // L1に昇格
                globalMemoryCache!.set(cacheKey, cached, 30);
                return cached;
              }
            } catch (error) {
              logger.debug(`favorite-loader.l2-error: ${error}`);
            }
            dbCheckList.push(articleId);
            return null;
          })
        );

        // L2結果をマージ
        let l2Index = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i] === null) {
            results[i] = l2Results[l2Index++] || null as any;
          }
        }
      } else {
        dbCheckList.push(...l2CheckList);
      }

      // Step 3: データベースクエリ（L1/L2ミスのみ）
      if (dbCheckList.length > 0) {
        stats.dbQueries++;

        const favorites = await prisma.favorite.findMany({
          where: {
            userId,
            articleId: {
              in: dbCheckList
            }
          }
        });

        // 高速検索用のMapを作成
        const favoriteMap = new Map<string, Favorite>();
        favorites.forEach(favorite => {
          favoriteMap.set(favorite.articleId, favorite);
        });

        // DB結果の処理とキャッシュ保存
        const dbResults = dbCheckList.map(articleId => {
          const favorite = favoriteMap.get(articleId);
          const status: FavoriteStatus = {
            articleId,
            isFavorited: !!favorite,
            favoritedAt: favorite?.createdAt
          };

          // L1とL2にキャッシュ保存
          const cacheKey = `favorite:${userId}:${articleId}`;
          globalMemoryCache!.set(cacheKey, status, 30);

          // L2への保存は非同期で実行
          if (globalRedisCache) {
            globalRedisCache.set(cacheKey, status, 60).catch(error => {
              logger.debug(`favorite-loader.l2-save-error: ${error}`);
            });
          }

          return status;
        });

        // DB結果をマージ
        let dbIndex = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i] === null || !(results[i] as any).articleId) {
            results[i] = dbResults[dbIndex++];
          }
        }
      }

      const duration = Date.now() - startTime;
      const queueWait = startTime - queueStartTime;

      // メトリクスをオプティマイザーに記録
      optimizer.recordMetrics({
        batchSize: articleIds.length,
        latency: duration,
        queueWait: queueWait,
        itemCount: articleIds.length,
        cacheHits: stats.l1Hits + stats.l2Hits,
        cacheMisses: dbCheckList.length,
      });

      logger.info(`favorite-loader.batch: total=${articleIds.length}, L1=${stats.l1Hits}, L2=${stats.l2Hits}, DB=${dbCheckList.length}, ${duration}ms`);

      return results;
    },
    {
      cache: false, // DataLoaderの内部キャッシュは無効化（独自キャッシュを使用）
      maxBatchSize: options?.maxBatchSize || optimizer.getBatchSize(), // 動的バッチサイズ
      batchScheduleFn: options?.batchScheduleFn,
    }
  );
}

/**
 * お気に入りキャッシュの無効化
 */
export async function invalidateFavoriteCache(userId: string, articleId: string) {
  const cacheKey = `favorite:${userId}:${articleId}`;

  if (globalMemoryCache) {
    globalMemoryCache.delete(cacheKey);
  }

  if (globalRedisCache) {
    await globalRedisCache.delete(cacheKey);
  }

  logger.debug(`favorite-loader.invalidated: ${cacheKey}`);
}

/**
 * 統計情報を取得
 */
export function getFavoriteLoaderStats() {
  const hitRate = stats.totalRequests > 0
    ? ((stats.l1Hits + stats.l2Hits) / stats.totalRequests) * 100
    : 0;

  return {
    ...stats,
    hitRate: hitRate.toFixed(2) + '%',
    memoryCache: globalMemoryCache?.getStats(),
  };
}