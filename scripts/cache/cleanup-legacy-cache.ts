/**
 * 旧キー形式キャッシュクリーンアップスクリプト
 * codex推奨: キー形式変更後の既存キャッシュ削除
 */

import { TwoLayerCacheManager } from '../../lib/dataloader/cache-utils';
import { DataLoaderMemoryCache } from '../../lib/cache/memory-cache';
import { RedisCache } from '../../lib/cache/redis-cache';
import logger from '../../lib/logger';

async function cleanupLegacyCache() {
  try {
    logger.info('Legacy cache cleanup started...');

    // 一時的なキャッシュマネージャーを作成（クリーンアップ専用）
    const memoryCache = new DataLoaderMemoryCache();
    const redisCache = new RedisCache({
      ttl: 300,
      namespace: '@techtrend/cache:views',
    });

    const cacheManager = new TwoLayerCacheManager(
      memoryCache,
      redisCache,
      'view',
      30, // l1TTL
      60  // l2TTL
    );

    // 旧形式の view キャッシュを削除
    // 旧: view:${articleId}
    // 新: view:${userLen}:${userId}:${articleLen}:${articleId}
    const deletedCount = await cacheManager.invalidatePattern('*');

    logger.info(`Legacy cache cleanup completed. Deleted ${deletedCount} entries.`);

    // 統計情報を出力
    const stats = cacheManager.getStats();
    logger.info(`Cache stats after cleanup: ${JSON.stringify(stats)}`);

  } catch (error) {
    logger.error(`Legacy cache cleanup failed: ${error}`);
    throw error; // process.exitを削除してエラーをスロー
  }
}

// スクリプト実行
if (require.main === module) {
  cleanupLegacyCache()
    .then(() => {
      logger.info('Cache cleanup script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Cache cleanup script failed: ${error}`);
      process.exit(1);
    });
}

export { cleanupLegacyCache };