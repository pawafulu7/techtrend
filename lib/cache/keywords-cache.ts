import { RedisCache } from './redis-cache';
import { CACHE_TTL } from './constants';
import logger from '@/lib/logger';

/**
 * 「いま伸びている話題」の集計（lib/services/trending-keywords.ts）のキー。
 * 急上昇の一覧・7 区間の件数・総数を1つの値に載せる
 */
export const TRENDING_SERIES_CACHE_KEY = 'trending-series:v1';

/**
 * キーワード分析専用のキャッシュクラス
 * トレンド概要で使用
 */
export class KeywordsCache extends RedisCache {
  constructor() {
    super({
      ttl: CACHE_TTL.LONG,
      namespace: '@techtrend/cache:keywords', // trendsとは別の名前空間
    });
  }

  /**
   * 急上昇の集計を捨てる。数える記事が変わったとき（記事の非表示・技術以外の判定・ソースの有効・無効の
   * 切り替え）に呼ぶ。集計中のロック（`<キー>:lock`）は消さない。
   * 失敗しても例外を投げない（呼び出し元の DB の更新やほかの無効化を失敗にしない。値は TTL で消える）
   */
  async invalidateTrending(): Promise<void> {
    try {
      await this.delete(TRENDING_SERIES_CACHE_KEY);
    } catch (error) {
      logger.warn(
        { err: error },
        'Failed to invalidate trending keywords cache'
      );
    }
  }
}

export const keywordsCache = new KeywordsCache();
