import { RedisCache } from './index';
import logger from '@/lib/logger';

/**
 * お気に入り状態のキャッシュ管理クラス
 * ユーザーごとのお気に入り状態を効率的にキャッシュ
 */
export class FavoritesCache {
  private cache: RedisCache;

  constructor() {
    // TTL: 5分（ユーザーアクションによる即座の無効化）
    this.cache = new RedisCache({
      ttl: 300, // 5分
      namespace: '@techtrend/cache:favorites'
    });
  }

  /**
   * ユーザーのお気に入り状態を一括取得
   */
  async getBatch(userId: string, articleIds: string[]): Promise<{ [key: string]: boolean } | null> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // キャッシュから取得
      const cached = await this.cache.get<{ [key: string]: boolean }>(cacheKey);

      if (cached) {
        // リクエストされた記事IDのみを返す
        const result: { [key: string]: boolean } = {};
        for (const articleId of articleIds) {
          result[articleId] = cached[articleId] || false;
        }

        logger.debug({ userId, hit: true, articlesCount: articleIds.length }, 'Favorites cache accessed');
        return result;
      }

      logger.debug({ userId, hit: false }, 'Favorites cache miss');
      return null;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get favorites from cache');
      return null;
    }
  }

  /**
   * ユーザーのお気に入り状態を一括保存
   */
  async setBatch(userId: string, favorites: { [key: string]: boolean }): Promise<void> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // 既存のキャッシュを取得（部分更新のため）
      const existing = await this.cache.get<{ [key: string]: boolean }>(cacheKey) || {};

      // 新しいデータをマージ
      const updated = {
        ...existing,
        ...favorites
      };

      // キャッシュに保存
      await this.cache.set(cacheKey, updated);

      logger.debug({ userId, articlesCount: Object.keys(favorites).length }, 'Favorites cached');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to cache favorites');
    }
  }

  /**
   * 単一記事のお気に入り状態を更新
   */
  async updateSingle(userId: string, articleId: string, isFavorite: boolean): Promise<void> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // 既存のキャッシュを取得
      const existing = await this.cache.get<{ [key: string]: boolean }>(cacheKey);

      if (existing) {
        // 単一の状態を更新
        existing[articleId] = isFavorite;
        await this.cache.set(cacheKey, existing);

        logger.debug({ userId, articleId, isFavorite }, 'Single favorite updated in cache');
      }
    } catch (error) {
      logger.error({ error, userId, articleId }, 'Failed to update single favorite in cache');
    }
  }

  /**
   * ユーザーのお気に入りキャッシュを無効化
   */
  async invalidate(userId: string): Promise<void> {
    const cacheKey = this.getCacheKey(userId);

    try {
      await this.cache.delete(cacheKey);
      logger.debug({ userId }, 'Favorites cache invalidated');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to invalidate favorites cache');
    }
  }

  /**
   * 全ユーザーのお気に入りキャッシュをクリア
   * （メンテナンス用）
   */
  async clearAll(): Promise<void> {
    try {
      // TODO: Redis SCANコマンドを使用したパターンマッチング削除を実装
      // 現在は個別削除のみサポート
      logger.info('Clear all favorites cache - not implemented yet');
    } catch (error) {
      logger.error({ error }, 'Failed to clear all favorites cache');
    }
  }

  /**
   * キャッシュキーの生成
   */
  private getCacheKey(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * 統計をリセット
   */
  resetStats(): void {
    this.cache.resetStats();
  }
}

// シングルトンインスタンスをエクスポート
export const favoriteCache = new FavoritesCache();