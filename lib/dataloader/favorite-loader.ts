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
import { DataLoaderMemoryCache } from '@/lib/cache/memory-cache';
import { RedisCache } from '@/lib/cache/redis-cache';
import { getBatchOptimizer } from './batch-optimizer';
import logger from '@/lib/logger';

// グローバルキャッシュインスタンス（プロセス内共有）
let globalMemoryCache: DataLoaderMemoryCache | null = null;
let globalRedisCache: RedisCache | null = null;

// メトリクス収集
const stats = {
  l1Hits: 0,
  l2Hits: 0,
  dbQueries: 0,
  totalRequests: 0,
  batchCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  dbFallbacks: 0,
  errors: 0,
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
  const useCache = options?.cache !== false;
  const bypassL1 = options?.bypassL1 === true;

  if (useCache) {
    initializeCaches();
  }

  const memoryCache = useCache ? globalMemoryCache : null;
  const redisCache = useCache ? globalRedisCache : null;

  // バッチオプティマイザーを取得
  const optimizer = getBatchOptimizer('favorite');

  return new DataLoader<string, FavoriteStatus>(
    async (articleIds: readonly string[]) => {
      const startTime = Date.now();
      const queueStartTime = Date.now(); // キュー待ち時間計測用
      stats.totalRequests += articleIds.length;

      let l1HitsThisBatch = 0;
      let l2HitsThisBatch = 0;

      const results: FavoriteStatus[] = [];
      const l2CheckList: string[] = [];
      const dbCheckList: string[] = [];

      // Step 1: L1メモリキャッシュチェック
      for (const articleId of articleIds) {
        const cacheKey = `favorite:${userId}:${articleId}`;

        if (memoryCache && !bypassL1) {
          const cached = memoryCache.get(cacheKey);
          // null/undefined の双方をミス扱い
          if (cached != null) {
            stats.l1Hits++;
            l1HitsThisBatch++;
            results.push(cached as FavoriteStatus);
            continue;
          }
        }

        if (redisCache) {
          l2CheckList.push(articleId);
        } else {
          dbCheckList.push(articleId);
        }

        results.push(null as any); // プレースホルダー
      }

      // Step 2: L2 Redisキャッシュチェック（L1ミスのみ）
      if (redisCache && l2CheckList.length > 0) {
        const l2Results = await Promise.all(
          l2CheckList.map(async (articleId) => {
            const cacheKey = `favorite:${userId}:${articleId}`;
            try {
              const cached = await redisCache.get<FavoriteStatus>(cacheKey);
              if (cached) {
                stats.l2Hits++;
                l2HitsThisBatch++;
                // L1に昇格
                memoryCache?.set(cacheKey, cached, 30);
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
          if (results[i] == null) {
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
        if (favorites && Array.isArray(favorites)) {
          favorites.forEach(favorite => {
            favoriteMap.set(favorite.articleId, favorite);
          });
        }

        // DB結果の処理とキャッシュ保存
        const dbResults = dbCheckList.map(articleId => {
          const favorite = favoriteMap.get(articleId);
          const status: FavoriteStatus = {
            articleId,
            isFavorited: !!favorite,
            favoritedAt: favorite?.createdAt
          };

          // L1メモリキャッシュのみに保存
          // L2 Redisへの書き込みは updateFavoriteCache() のみで行う
          // （競合状態を防ぐため、DBフォールバック時はL2に書き込まない）
          const cacheKey = `favorite:${userId}:${articleId}`;
          if (memoryCache) {
            memoryCache.set(cacheKey, status, 30);
          }

          return status;
        });

        // DB結果をマージ
        let dbIndex = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i] == null || !(results[i] as any)?.articleId) {
            results[i] = dbResults[dbIndex++];
          }
        }
      }

      const duration = Date.now() - startTime;
      const queueWait = startTime - queueStartTime;

      // バッチ単位のキャッシュヒット数を計算（累積値ではなくバッチ固有の値）
      const cacheHitsThisBatch = articleIds.length - dbCheckList.length;

      // メトリクスをオプティマイザーに記録
      optimizer.recordMetrics({
        batchSize: articleIds.length,
        latency: duration,
        queueWait: queueWait,
        itemCount: articleIds.length,
        cacheHits: cacheHitsThisBatch,  // バッチ単位のキャッシュヒット数
        cacheMisses: dbCheckList.length,
      });

      logger.info(
        {
          total: articleIds.length,
          bypassL1,
          l1Hits: l1HitsThisBatch,
          l2Hits: l2HitsThisBatch,
          db: dbCheckList.length,
          durationMs: duration,
        },
        'favorite-loader.batch'
      );

      return results;
    },
    {
      cache: options?.cache ?? true,
      maxBatchSize: options?.maxBatchSize || optimizer.getBatchSize(), // 動的バッチサイズ
      batchScheduleFn: options?.batchScheduleFn,
    }
  );
}

/**
 * お気に入りキャッシュの更新
 * キャッシュを削除ではなく新しい値で更新することで、
 * 次回アクセス時に即座に正しい状態を返す
 */
export async function updateFavoriteCache(
  userId: string,
  articleId: string,
  isFavorited: boolean,
  favoritedAt?: Date
) {
  initializeCaches();

  const cacheKey = `favorite:${userId}:${articleId}`;
  const status: FavoriteStatus = {
    articleId,
    isFavorited,
    favoritedAt,
  };

  // L1メモリキャッシュを更新
  if (globalMemoryCache) {
    globalMemoryCache.set(cacheKey, status, 30);
  }

  // L2 Redisキャッシュを更新
  if (globalRedisCache) {
    await globalRedisCache.set(cacheKey, status, 60);
  }

  logger.debug(`favorite-loader.updated: ${cacheKey} -> ${isFavorited}`);
}

/**
 * お気に入りキャッシュの無効化（後方互換性のため残す）
 */
export async function invalidateFavoriteCache(userId: string, articleId: string) {
  // Ensure caches exist so invalidation works even if this process
  // hasn't created a loader yet (e.g. serverless route instances).
  initializeCaches();

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

/**
 * 統計情報をリセット
 */
export function resetFavoriteLoaderStats() {
  stats.totalRequests = 0;
  stats.batchCount = 0;
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.l1Hits = 0;
  stats.l2Hits = 0;
  stats.dbFallbacks = 0;
  stats.errors = 0;

  // メモリキャッシュもクリア
  if (globalMemoryCache) {
    globalMemoryCache.reset();
  }

  logger.debug('favorite-loader.stats-reset');
}

/**
 * キャッシュインスタンスをリセット（テスト用）
 */
export function resetFavoriteLoaderCaches() {
  // 既存のキャッシュインスタンスをクリアしてからnullに設定
  if (globalMemoryCache) {
    globalMemoryCache.clear();
  }
  if (globalRedisCache) {
    // RedisキャッシュはMockなので特に処理不要
  }
  globalMemoryCache = null;
  globalRedisCache = null;
  resetFavoriteLoaderStats();
  logger.debug('favorite-loader.caches-reset');
}
