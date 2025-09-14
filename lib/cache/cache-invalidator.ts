import { Article, ArticleCategory } from '@prisma/client';
import { tagCache } from './tag-cache';
import { sourceCache } from './source-cache';
import { popularCache } from './popular-cache';
import { RedisCache } from './index';
import { getRedisService } from '@/lib/redis/factory';
import type { IRedisService } from '@/lib/redis/interfaces';
import logger from '@/lib/logger';

/**
 * キャッシュ無効化を管理するクラス
 * DB操作に応じて関連するキャッシュを自動的にクリアする
 */
export class CacheInvalidator {
  private articleCache: RedisCache;
  private relatedCache: RedisCache;
  private tagCloudCache: RedisCache;
  private redisService: IRedisService;

  constructor(redisService?: IRedisService) {
    this.articleCache = new RedisCache({
      ttl: 300,
      namespace: '@techtrend/cache:articles'
    });

    this.relatedCache = new RedisCache({
      ttl: 600,
      namespace: '@techtrend/cache:related'
    });

    this.tagCloudCache = new RedisCache({
      ttl: 1800,
      namespace: '@techtrend/cache:tagcloud'
    });

    this.redisService = redisService || getRedisService();
  }

  /**
   * 新しい記事が追加された時のキャッシュ無効化
   */
  async onArticleCreated(article?: Article): Promise<void> {
    try {
      logger.info({ articleId: article?.id }, 'Invalidating cache on article create');

      await Promise.all([
        // 記事一覧キャッシュを無効化
        this.articleCache.invalidatePattern('*'),
        // 人気記事キャッシュを無効化
        popularCache.invalidateAll(),
        // タグクラウドキャッシュを無効化
        this.tagCloudCache.invalidatePattern('*'),
        // 新規: APIエンドポイントのキャッシュもクリア
        this.redisService.clearPattern('@techtrend/cache:api:articles:*'),
        this.redisService.clearPattern('@techtrend/cache:api:lightweight:*'),
        this.redisService.clearPattern('@techtrend/cache:l1:public:*')
      ]);

      // カテゴリ別キャッシュをクリア
      if (article?.category) {
        await this.invalidateCategoryCache(article.category);
      }

      // ソース別キャッシュをクリア
      if (article?.sourceId) {
        await this.invalidateSourceCache(article.sourceId);
      }
    } catch (error) {
      logger.error({ error, articleId: article?.id }, 'Failed to invalidate cache on article create');
    }
  }

  /**
   * 記事が更新された時のキャッシュ無効化
   */
  async onArticleUpdated(articleId: string, changes?: Partial<Article>): Promise<void> {
    try {
      logger.info({ articleId, changes: changes ? Object.keys(changes) : [] }, 'Invalidating cache on article update');

      await Promise.all([
        // 記事一覧キャッシュを無効化
        this.articleCache.invalidatePattern('*'),
        // 関連記事キャッシュを無効化
        this.relatedCache.delete(`related:articleId:${articleId}`),
        // 人気記事キャッシュを無効化（スコアが変わる可能性があるため）
        popularCache.invalidateAll(),
        // 特定の記事に関連するキャッシュをクリア
        this.redisService.clearPattern(`*:article:${articleId}:*`),
        this.redisService.clearPattern(`*:${articleId}`)
      ]);

      // カテゴリやソースが変更された場合は追加のクリア
      if (changes?.category || changes?.sourceId) {
        await this.invalidateListCaches();
      }

      // タイトルや要約が変更された場合は検索キャッシュもクリア
      if (changes?.title || changes?.summary || changes?.detailedSummary) {
        await this.invalidateSearchCaches();
      }
    } catch (error) {
      logger.error({ error, articleId }, 'Failed to invalidate cache on article update');
    }
  }

  /**
   * 記事が削除された時のキャッシュ無効化
   */
  async onArticleDeleted(articleId: string): Promise<void> {
    try {
      logger.info({ articleId }, 'Invalidating cache on article delete');
      await this.onArticleUpdated(articleId);

      // 統計キャッシュもクリア
      await this.redisService.clearPattern('@techtrend/cache:stats:*');
    } catch (error) {
      logger.error({ error, articleId }, 'Failed to invalidate cache on article delete');
    }
  }

  /**
   * タグが作成・更新された時のキャッシュ無効化
   */
  async onTagUpdated(tagId?: string): Promise<void> {
    await Promise.all([
      // タグキャッシュを無効化
      tagId ? tagCache.invalidateTag(tagId) : tagCache.invalidate(),
      // タグクラウドキャッシュを無効化
      this.tagCloudCache.invalidatePattern('*'),
      // 記事一覧キャッシュを無効化（タグフィルタリングがあるため）
      this.articleCache.invalidatePattern('*')
    ]);
  }

  /**
   * ソースが作成・更新された時のキャッシュ無効化
   */
  async onSourceUpdated(sourceId?: string): Promise<void> {
    await Promise.all([
      // ソースキャッシュを無効化
      sourceId ? sourceCache.invalidateSource(sourceId) : sourceCache.invalidate(),
      // 記事一覧キャッシュを無効化（ソースフィルタリングがあるため）
      this.articleCache.invalidatePattern('*')
    ]);
  }

  /**
   * 一括記事インポート後のキャッシュ無効化
   */
  async onBulkImport(): Promise<void> {
    await Promise.all([
      // すべてのキャッシュを無効化
      this.articleCache.invalidatePattern('*'),
      this.relatedCache.invalidatePattern('*'),
      this.tagCloudCache.invalidatePattern('*'),
      tagCache.invalidate(),
      sourceCache.invalidate(),
      popularCache.invalidateAll()
    ]);
  }

  /**
   * 定期的なキャッシュリフレッシュ
   */
  async refreshStaleCache(): Promise<void> {
    // 人気記事の日次キャッシュをリフレッシュ
    await popularCache.invalidatePeriod('daily');
  }

  /**
   * ユーザー固有データのキャッシュ無効化
   * お気に入りや既読状態の変更時に呼び出される
   */
  async invalidateUserCache(userId: string, type: 'favorites' | 'read_status' | 'recommendations' | 'all'): Promise<void> {
    try {
      logger.info({ userId, type }, 'Invalidating user cache');

      if (type === 'all') {
        // すべてのユーザーキャッシュをクリア
        await this.redisService.clearPattern(`user:${userId}:*`);
        await this.redisService.clearPattern(`@techtrend/cache:l2:user:${userId}:*`);
        await this.redisService.clearPattern(`recommendations:${userId}:*`);
      } else {
        // 特定タイプのキャッシュのみクリア
        await this.redisService.clearPattern(`user:${userId}:${type}:*`);
        await this.redisService.clearPattern(`@techtrend/cache:l2:user:${userId}:${type}:*`);

        if (type === 'recommendations') {
          await this.redisService.clearPattern(`recommendations:${userId}:*`);
        }
      }
    } catch (error) {
      logger.error({ error, userId, type }, 'Failed to invalidate user cache');
    }
  }

  /**
   * 一覧系キャッシュの無効化
   * 記事の追加・削除・重要な更新時に呼び出される
   */
  private async invalidateListCaches(): Promise<void> {
    // 基本的な記事リストキャッシュをクリア
    await this.redisService.clearPattern('@techtrend/cache:api:articles:basic:*');
    await this.redisService.clearPattern('@techtrend/cache:api:lightweight:articles:basic:*');
    await this.redisService.clearPattern('@techtrend/cache:l1:public:*');

    // 人気記事キャッシュもクリア
    await this.redisService.clearPattern('*:popular:*');
  }

  /**
   * 検索キャッシュの無効化
   * 記事の内容が変更された時に呼び出される
   */
  private async invalidateSearchCaches(): Promise<void> {
    await this.redisService.clearPattern('@techtrend/cache:l3:search:*');
    await this.redisService.clearPattern('*:search:*');
  }

  /**
   * ソース別キャッシュの無効化
   */
  private async invalidateSourceCache(sourceId: string): Promise<void> {
    await this.redisService.clearPattern(`*:source:${sourceId}:*`);
    await this.redisService.clearPattern(`*:sources:*${sourceId}*`);
  }

  /**
   * カテゴリ別キャッシュの無効化
   */
  private async invalidateCategoryCache(category: ArticleCategory): Promise<void> {
    await this.redisService.clearPattern(`*:category:${category}:*`);
  }

  /**
   * すべてのキャッシュをクリア（緊急時用）
   */
  async invalidateAll(): Promise<void> {
    try {
      logger.warn('Invalidating ALL caches');

      await this.redisService.clearPattern('@techtrend/cache:*');
      await this.redisService.clearPattern('user:*');
      await this.redisService.clearPattern('recommendations:*');

      logger.info('All caches invalidated successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to invalidate all caches');
    }
  }
}

// シングルトンインスタンスをエクスポート
export const cacheInvalidator = new CacheInvalidator();