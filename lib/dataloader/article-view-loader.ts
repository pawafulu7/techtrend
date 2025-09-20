/**
 * Article View DataLoader with Two-Layer Cache
 * 既読状態のバッチローディング（共通ユーティリティ使用）
 * codex推奨: お気に入りと同じパターンで実装の共通化
 */

import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';
import type { ArticleView } from '@prisma/client';
import type { LoaderOptions } from './types';
import { DataLoaderMemoryCache } from '../cache/memory-cache';
import { RedisCache } from '../cache/redis-cache';
import { TwoLayerCacheManager, CacheKeyBuilder } from './cache-utils';
import { getBatchOptimizer } from './batch-optimizer';
import logger from '../logger';

/**
 * 既読状態の型定義
 */
export interface ViewStatus {
  articleId: string;
  isViewed: boolean;
  viewedAt?: Date;
  isRead: boolean;
  readAt?: Date;
}

// グローバルキャッシュマネージャー
let globalCacheManager: TwoLayerCacheManager<ViewStatus> | null = null;

/**
 * キャッシュマネージャーの初期化
 */
function initializeCacheManager(): TwoLayerCacheManager<ViewStatus> {
  if (!globalCacheManager) {
    const memoryCache = new DataLoaderMemoryCache();
    const redisCache = new RedisCache({
      ttl: 60,
      namespace: '@techtrend/cache:views',
    });

    globalCacheManager = new TwoLayerCacheManager<ViewStatus>(
      memoryCache,
      redisCache,
      'view',
      30,  // L1 TTL: 30秒
      60   // L2 TTL: 60秒
    );
  }
  return globalCacheManager;
}

/**
 * 既読状態をバッチで取得するDataLoaderを作成
 * codex推奨: ファクトリーパターンでリクエストスコープ管理
 *
 * @param userId - 既読状態を確認するユーザーのID
 * @param options - DataLoaderのオプション設定
 */
export function createArticleViewLoader(userId: string, options?: LoaderOptions) {
  const cacheManager = initializeCacheManager();
  const optimizer = getBatchOptimizer('view');

  return new DataLoader<string, ViewStatus>(
    async (articleIds: readonly string[]) => {
      const batchStartTime = Date.now();
      // 共通ユーティリティを使用したバッチローディング
      const result = await cacheManager.batchLoad(
        articleIds,
        // データベースフェッチャー
        async (missingKeys) => {
          const views = await prisma.articleView.findMany({
            where: {
              userId,
              articleId: {
                in: missingKeys as string[]
              }
            }
          });

          // 結果をMapに変換
          const viewMap = new Map<string, ArticleView>();
          views.forEach(view => {
            viewMap.set(view.articleId, view);
          });

          // ViewStatusに変換
          const results = new Map<string, ViewStatus>();
          for (const articleId of missingKeys) {
            const view = viewMap.get(articleId);
            results.set(articleId, {
              articleId,
              isViewed: !!view,
              viewedAt: view?.viewedAt || undefined,
              isRead: view?.isRead || false,
              readAt: view?.readAt || undefined,
            });
          }

          return results;
        },
        {
          logPrefix: `view-loader:${userId}`,
          statsCallback: (stats) => {
            // メトリクス収集（必要に応じて外部システムに送信）
            if (stats.batchCount % 100 === 0) {
              logger.info(`view-loader.stats: ${JSON.stringify(cacheManager.getStats())}`);
            }
          }
        }
      );

      // メトリクスをオプティマイザーに記録
      const duration = Date.now() - batchStartTime;
      const stats = cacheManager.getStats();
      optimizer.recordMetrics({
        batchSize: articleIds.length,
        latency: duration,
        queueWait: 0, // TwoLayerCacheManagerでは別途計測
        itemCount: articleIds.length,
        cacheHits: stats.l1Hits + stats.l2Hits,
        cacheMisses: stats.dbQueries > 0 ? articleIds.length - (stats.l1Hits + stats.l2Hits) : 0,
      });

      return result;
    },
    {
      cache: false, // DataLoaderの内部キャッシュは無効化
      maxBatchSize: options?.maxBatchSize || optimizer.getBatchSize(), // 動的バッチサイズ
      batchScheduleFn: options?.batchScheduleFn,
    }
  );
}

/**
 * 既読状態キャッシュの無効化
 * codex推奨: Write-Through戦略
 */
export async function invalidateViewCache(userId: string, articleId: string) {
  const cacheManager = initializeCacheManager();
  const key = `${userId}:${articleId}`;
  await cacheManager.invalidate(key);
}

/**
 * ユーザーの全既読キャッシュを無効化
 */
export async function invalidateUserViewCache(userId: string) {
  const cacheManager = initializeCacheManager();
  const pattern = `${userId}:*`;
  await cacheManager.invalidatePattern(pattern);
}

/**
 * 既読状態を更新（Write-Through）
 * codex推奨: 書き込み時に即座にキャッシュ更新
 */
export async function updateViewStatus(
  userId: string,
  articleId: string,
  status: Partial<ViewStatus>
): Promise<ViewStatus> {
  // データベース更新
  const view = await prisma.articleView.upsert({
    where: {
      userId_articleId: {
        userId,
        articleId,
      },
    },
    update: {
      isRead: status.isRead,
      readAt: status.readAt,
      viewedAt: status.viewedAt,
    },
    create: {
      userId,
      articleId,
      isRead: status.isRead || false,
      readAt: status.readAt,
      viewedAt: status.viewedAt || new Date(),
    },
  });

  const newStatus: ViewStatus = {
    articleId,
    isViewed: true,
    viewedAt: view.viewedAt || undefined,
    isRead: view.isRead,
    readAt: view.readAt || undefined,
  };

  // キャッシュ更新（Write-Through）
  const cacheManager = initializeCacheManager();
  const key = `${userId}:${articleId}`;
  const cacheKey = `view:${key}`;

  // L1とL2両方を更新
  const memoryCache = new DataLoaderMemoryCache();
  const redisCache = new RedisCache({
    ttl: 60,
    namespace: '@techtrend/cache:views',
  });

  await Promise.all([
    memoryCache.set(cacheKey, newStatus, 30),
    redisCache.set(cacheKey, newStatus, 60),
  ]);

  logger.debug(`view-loader.updated: ${key}`);
  return newStatus;
}

/**
 * 統計情報を取得
 */
export function getViewLoaderStats() {
  const cacheManager = initializeCacheManager();
  return cacheManager ? cacheManager.getStats() : null;
}

/**
 * 統計情報をリセット
 */
export function resetViewLoaderStats() {
  const cacheManager = initializeCacheManager();
  if (cacheManager) {
    cacheManager.resetStats();
  }
}