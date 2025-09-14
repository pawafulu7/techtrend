import { ArticleCategory } from '@prisma/client';
import { tagCache } from './tag-cache';
import { sourceCache } from './source-cache';
import { popularCache } from './popular-cache';
import { RedisCache } from './index';
import { getRedisService } from '@/lib/redis/factory';
import type { IRedisService } from '@/lib/redis/interfaces';
import logger from '@/lib/logger';
import {
  CACHE_NAMESPACE_PREFIX,
  CACHE_NAMESPACES,
  CACHE_TTL,
  createCachePattern,
  createUserCacheKey,
  createL2UserCacheKey
} from './constants';

// 一時的な型定義（Prismaの型生成問題を回避）
interface Article {
  id: string;
  title: string;
  url: string;
  summary?: string | null;
  thumbnail?: string | null;
  content?: string | null;
  publishedAt: Date;
  sourceId: string;
  category?: ArticleCategory | null;
  bookmarks: number;
  qualityScore: number;
  userVotes: number;
  createdAt: Date;
  updatedAt: Date;
  difficulty?: string | null;
  detailedSummary?: string | null;
  articleType?: string | null;
  summaryVersion: number;
}

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
      ttl: CACHE_TTL.SHORT,
      namespace: CACHE_NAMESPACES.ARTICLES
    });

    this.relatedCache = new RedisCache({
      ttl: CACHE_TTL.MEDIUM,
      namespace: CACHE_NAMESPACES.ARTICLES_RELATED
    });

    this.tagCloudCache = new RedisCache({
      ttl: CACHE_TTL.LONG,
      namespace: CACHE_NAMESPACES.TAG_CLOUD
    });

    this.redisService = redisService || getRedisService();
  }

  /**
   * Invalidate cache when a new article is created
   * Clears article lists, popular articles, tag cloud, and related API caches
   * @param article - The newly created article (optional)
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
        this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.ARTICLES_API)),
        this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.ARTICLES_LIGHTWEIGHT)),
        this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.L1_PUBLIC))
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
   * Invalidate cache when an article is updated
   * Clears article lists, related articles, popular lists, and search caches as needed
   * @param articleId - The ID of the updated article
   * @param changes - Partial article changes (optional)
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
   * Invalidate cache when an article is deleted
   * Clears all article-related caches and statistics
   * @param articleId - The ID of the deleted article
   */
  async onArticleDeleted(articleId: string): Promise<void> {
    try {
      logger.info({ articleId }, 'Invalidating cache on article delete');
      await this.onArticleUpdated(articleId);

      // 統計キャッシュもクリア
      await this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.STATS));
    } catch (error) {
      logger.error({ error, articleId }, 'Failed to invalidate cache on article delete');
    }
  }

  /**
   * Invalidate cache when tags are created or updated
   * Clears tag cache, tag cloud, and article lists (due to tag filtering)
   * @param tagId - The ID of the updated tag (optional)
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
   * Invalidate cache when sources are created or updated
   * Clears source cache and article lists (due to source filtering)
   * @param sourceId - The ID of the updated source (optional)
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
   * Invalidate all caches after bulk import
   * Clears all cache types to ensure data consistency
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
   * Refresh stale cache periodically
   * Updates daily popular article caches
   */
  async refreshStaleCache(): Promise<void> {
    // 人気記事の日次キャッシュをリフレッシュ
    await popularCache.invalidatePeriod('daily');
  }

  /**
   * Invalidate user-specific cache
   * Clears user favorites, read status, or recommendation caches
   * @param userId - The user ID
   * @param type - The type of cache to invalidate
   */
  async invalidateUserCache(userId: string, type: 'favorites' | 'read_status' | 'recommendations' | 'all'): Promise<void> {
    try {
      logger.info({ userId, type }, 'Invalidating user cache');

      if (type === 'all') {
        // すべてのユーザーキャッシュをクリア
        await this.redisService.clearPattern(createUserCacheKey(userId, '*'));
        await this.redisService.clearPattern(createL2UserCacheKey(userId, '*'));
        await this.redisService.clearPattern(`${CACHE_NAMESPACES.RECOMMENDATIONS}:${userId}:*`);
      } else {
        // 特定タイプのキャッシュのみクリア
        await this.redisService.clearPattern(createUserCacheKey(userId, `${type}:*`));
        await this.redisService.clearPattern(createL2UserCacheKey(userId, `${type}:*`));

        if (type === 'recommendations') {
          await this.redisService.clearPattern(`${CACHE_NAMESPACES.RECOMMENDATIONS}:${userId}:*`);
        }
      }
    } catch (error) {
      logger.error({ error, userId, type }, 'Failed to invalidate user cache');
    }
  }

  /**
   * Invalidate list caches
   * Clears basic article lists and popular article caches
   * Called when articles are added/deleted or significantly updated
   */
  private async invalidateListCaches(): Promise<void> {
    // 基本的な記事リストキャッシュをクリア
    await this.redisService.clearPattern(`${CACHE_NAMESPACES.ARTICLES_API}:basic:*`);
    await this.redisService.clearPattern(`${CACHE_NAMESPACES.ARTICLES_LIGHTWEIGHT}:articles:basic:*`);
    await this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.L1_PUBLIC));

    // 人気記事キャッシュもクリア
    await this.redisService.clearPattern('*:popular:*');
  }

  /**
   * Invalidate search caches
   * Clears L3 search layer and search-related caches
   * Called when article content is modified
   */
  private async invalidateSearchCaches(): Promise<void> {
    await this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACES.L3_SEARCH));
    await this.redisService.clearPattern('*:search:*');
  }

  /**
   * Invalidate source-specific cache
   * @param sourceId - The source ID
   */
  private async invalidateSourceCache(sourceId: string): Promise<void> {
    await this.redisService.clearPattern(`*:source:${sourceId}:*`);
    await this.redisService.clearPattern(`*:sources:*${sourceId}*`);
  }

  /**
   * Invalidate category-specific cache
   * @param category - The article category
   */
  private async invalidateCategoryCache(category: ArticleCategory): Promise<void> {
    await this.redisService.clearPattern(`*:category:${category}:*`);
  }

  /**
   * Invalidate all caches (emergency use only)
   * Completely clears all cache entries across the application
   * WARNING: This will cause temporary performance degradation
   */
  async invalidateAll(): Promise<void> {
    try {
      logger.warn('Invalidating ALL caches');

      await this.redisService.clearPattern(createCachePattern(CACHE_NAMESPACE_PREFIX));
      await this.redisService.clearPattern(`${CACHE_NAMESPACES.USER}:*`);
      await this.redisService.clearPattern(`${CACHE_NAMESPACES.RECOMMENDATIONS}:*`);

      logger.info('All caches invalidated successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to invalidate all caches');
    }
  }
}

// シングルトンインスタンスをエクスポート
export const cacheInvalidator = new CacheInvalidator();