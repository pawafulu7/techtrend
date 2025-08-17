import { RedisCache } from './redis-cache';

/**
 * キーワード分析専用のキャッシュクラス
 * /api/trends/keywords エンドポイントで使用
 */
export class KeywordsCache extends RedisCache {
  constructor() {
    super({
      ttl: 1800, // 30分（デフォルト）
      namespace: '@techtrend/cache:keywords' // trendsとは別の名前空間
    });
  }

  /**
   * キーワード分析データ用のキャッシュキーを生成
   * @param type キーワードのタイプ
   * @returns キャッシュキー
   */
  generateKey(type: string = 'trending'): string {
    return `keywords:${type}`;
  }
}

export const keywordsCache = new KeywordsCache();