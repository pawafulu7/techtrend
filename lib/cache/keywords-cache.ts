import { RedisCache } from './redis-cache';
import { CACHE_TTL } from './constants';

/**
 * 「いま伸びている話題」の集計（lib/services/trending-keywords.ts）のキー。
 * 急上昇の一覧・7 区間の件数・総数・新着タグを1つの値に載せる
 */
export const TRENDING_SERIES_CACHE_KEY = 'trending-series:v1';

/**
 * キーワード分析専用のキャッシュクラス
 * トレンド概要・/api/trends/keywords で使用
 */
export class KeywordsCache extends RedisCache {
  constructor() {
    super({
      ttl: CACHE_TTL.LONG,
      namespace: '@techtrend/cache:keywords', // trendsとは別の名前空間
    });
  }

  /**
   * 急上昇の集計を捨てる。数える記事が変わったとき（記事の非表示・ソースの有効・無効の切り替え）に呼ぶ。
   * 集計中のロック（`<キー>:lock`）は消さない
   */
  async invalidateTrending(): Promise<void> {
    await this.delete(TRENDING_SERIES_CACHE_KEY);
  }
}

export const keywordsCache = new KeywordsCache();
