import { RedisCache } from './index';
import { CACHE_NAMESPACE_PREFIX, CACHE_TTL } from './constants';
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
      ttl: CACHE_TTL.SHORT,
      namespace: `${CACHE_NAMESPACE_PREFIX}:favorites`,
    });
  }

  /**
   * ユーザーのお気に入り状態を一括取得
   *
   * 要求した ID がすべてキャッシュに収録されているときだけ結果を返す。
   * キャッシュは画面ごとに違う ID 集合の setBatch をマージしたものなので、
   * 未収録の ID を false として返すと、お気に入り済みの記事を「未登録」と
   * 誤答する。1 件でも未収録なら null（キャッシュミス）にし、呼び出し元に
   * DB から引かせる（取得結果は setBatch で既存のキャッシュにマージされる）。
   */
  async getBatch(
    userId: string,
    articleIds: string[]
  ): Promise<{ [key: string]: boolean } | null> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // キャッシュから取得
      const cached = await this.cache.get<{ [key: string]: boolean }>(cacheKey);

      if (
        cached &&
        articleIds.every((articleId) => Object.hasOwn(cached, articleId))
      ) {
        // リクエストされた記事IDのみを返す
        const result: { [key: string]: boolean } = {};
        for (const articleId of articleIds) {
          result[articleId] = cached[articleId] === true;
        }

        logger.debug(
          { userId, hit: true, articlesCount: articleIds.length },
          'Favorites cache accessed'
        );
        return result;
      }

      logger.debug(
        { userId, hit: false, partial: Boolean(cached) },
        'Favorites cache miss'
      );
      return null;
    } catch (error) {
      logger.error(
        { err: error, userId },
        'Failed to get favorites from cache'
      );
      return null;
    }
  }

  /**
   * ユーザーのお気に入り状態を一括保存
   */
  async setBatch(
    userId: string,
    favorites: { [key: string]: boolean }
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // 既存のキャッシュを取得（部分更新のため）
      const existing =
        (await this.cache.get<{ [key: string]: boolean }>(cacheKey)) || {};

      // 新しいデータをマージ
      const updated = {
        ...existing,
        ...favorites,
      };

      // キャッシュに保存
      await this.cache.set(cacheKey, updated);

      logger.debug(
        { userId, articlesCount: Object.keys(favorites).length },
        'Favorites cached'
      );
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to cache favorites');
    }
  }

  /**
   * 単一記事のお気に入り状態を更新
   */
  async updateSingle(
    userId: string,
    articleId: string,
    isFavorite: boolean
  ): Promise<void> {
    const cacheKey = this.getCacheKey(userId);

    try {
      // 既存のキャッシュを取得
      const existing = await this.cache.get<{ [key: string]: boolean }>(
        cacheKey
      );

      if (existing) {
        // 単一の状態を更新
        existing[articleId] = isFavorite;
        await this.cache.set(cacheKey, existing);

        logger.debug(
          { userId, articleId, isFavorite },
          'Single favorite updated in cache'
        );
      }
    } catch (error) {
      logger.error(
        { err: error, userId, articleId },
        'Failed to update single favorite in cache'
      );
    }
  }

  /**
   * 全ユーザーのお気に入りキャッシュをクリア
   * （メンテナンス用）
   */
  async clearAll(): Promise<void> {
    try {
      await this.cache.invalidatePattern('user:*');
      logger.info('All favorites cache cleared successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to clear all favorites cache');
      throw error;
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
