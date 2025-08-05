import { tagCache } from './tag-cache';
import { sourceCache } from './source-cache';
import { popularCache } from './popular-cache';
import { RedisCache } from './index';

/**
 * キャッシュ無効化を管理するクラス
 */
export class CacheInvalidator {
  private articleCache: RedisCache;
  private relatedCache: RedisCache;
  private tagCloudCache: RedisCache;

  constructor() {
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
  }

  /**
   * 新しい記事が追加された時のキャッシュ無効化
   */
  async onArticleCreated(): Promise<void> {
    await Promise.all([
      // 記事一覧キャッシュを無効化
      this.articleCache.invalidatePattern('*'),
      // 人気記事キャッシュを無効化
      popularCache.invalidateAll(),
      // タグクラウドキャッシュを無効化
      this.tagCloudCache.invalidatePattern('*')
    ]);
  }

  /**
   * 記事が更新された時のキャッシュ無効化
   */
  async onArticleUpdated(articleId: string): Promise<void> {
    await Promise.all([
      // 記事一覧キャッシュを無効化
      this.articleCache.invalidatePattern('*'),
      // 関連記事キャッシュを無効化
      this.relatedCache.delete(`related:articleId:${articleId}`),
      // 人気記事キャッシュを無効化（スコアが変わる可能性があるため）
      popularCache.invalidateAll()
    ]);
  }

  /**
   * 記事が削除された時のキャッシュ無効化
   */
  async onArticleDeleted(articleId: string): Promise<void> {
    await this.onArticleUpdated(articleId);
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
}

// シングルトンインスタンスをエクスポート
export const cacheInvalidator = new CacheInvalidator();