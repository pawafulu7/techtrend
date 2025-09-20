import { RedisCache } from './redis-cache';
import { createHash } from 'crypto';

interface TagMapping {
  [key: string]: string; // name -> id
}

interface TagCacheOptions {
  ttl?: number;
  namespace?: string;
}

export class TagCache {
  private cache: RedisCache;
  private readonly DEFAULT_TTL = 900; // 15分
  private readonly MAX_BATCH_SIZE = 100;

  constructor(options: TagCacheOptions = {}) {
    this.cache = new RedisCache({
      ttl: options.ttl || this.DEFAULT_TTL,
      namespace: options.namespace || '@techtrend/cache:tags',
    });
  }

  /**
   * タグ名の配列からキャッシュキーを生成
   * ソート済みタグ名のハッシュを使用して安定したキーを生成
   */
  private generateCacheKey(tagNames: string[]): string {
    const sorted = [...tagNames].sort();
    const hash = createHash('sha256').update(sorted.join(',')).digest('hex');
    return `mapping:${hash.substring(0, 16)}`;
  }

  /**
   * タグ名からIDへのマッピングを取得（キャッシュ優先）
   */
  async getTagMapping(tagNames: string[]): Promise<TagMapping | null> {
    if (tagNames.length === 0) return {};

    const cacheKey = this.generateCacheKey(tagNames);

    // キャッシュから取得を試みる
    const cached = await this.cache.get<TagMapping>(cacheKey);
    if (cached) {
      return cached;
    }

    return null; // キャッシュミス
  }

  /**
   * タグマッピングをキャッシュに保存
   */
  async setTagMapping(tagNames: string[], mapping: TagMapping): Promise<void> {
    if (tagNames.length === 0) return;

    const cacheKey = this.generateCacheKey(tagNames);
    await this.cache.set(cacheKey, mapping);
  }

  /**
   * バッチ処理用: 大量のタグを処理
   */
  async processBatch(
    tagNames: string[],
    fetchFunction: (names: string[]) => Promise<TagMapping>
  ): Promise<TagMapping> {
    const result: TagMapping = {};

    // バッチサイズごとに分割
    for (let i = 0; i < tagNames.length; i += this.MAX_BATCH_SIZE) {
      const batch = tagNames.slice(i, i + this.MAX_BATCH_SIZE);

      // キャッシュチェック
      let mapping = await this.getTagMapping(batch);

      if (!mapping) {
        // キャッシュミスの場合はDBから取得
        mapping = await fetchFunction(batch);
        // キャッシュに保存
        await this.setTagMapping(batch, mapping);
      }

      Object.assign(result, mapping);
    }

    return result;
  }

  /**
   * 単一タグの検索
   */
  async getSingleTag(tagName: string): Promise<string | null> {
    const mapping = await this.getTagMapping([tagName]);
    return mapping ? mapping[tagName] || null : null;
  }

  /**
   * 人気タグのキャッシュ
   */
  async getPopularTags(): Promise<Array<{ id: string; name: string; count: number }> | null> {
    return await this.cache.get('popular:top20');
  }

  async setPopularTags(tags: Array<{ id: string; name: string; count: number }>): Promise<void> {
    await this.cache.set('popular:top20', tags, 3600); // 1時間キャッシュ
  }

  /**
   * キャッシュの無効化
   */
  async invalidate(pattern?: string): Promise<void> {
    if (pattern) {
      await this.cache.delete(`mapping:${pattern}*`);
    } else {
      // 全タグキャッシュをクリア
      await this.cache.delete('mapping:*');
      await this.cache.delete('popular:*');
    }
  }

  /**
   * メトリクス取得
   */
  async getMetrics() {
    // 実装は省略（必要に応じて追加）
    return {
      namespace: '@techtrend/cache:tags',
      ttl: this.DEFAULT_TTL,
    };
  }
}