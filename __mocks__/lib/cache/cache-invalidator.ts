/**
 * CacheInvalidator のモック実装
 * テスト環境では何もしない
 */

export class CacheInvalidator {
  constructor() {}

  async invalidateArticle(articleId: string) {
    // テスト環境では何もしない
    return;
  }

  async invalidateTag(tagName: string) {
    // テスト環境では何もしない
    return;
  }

  async invalidateSource(sourceId: string) {
    // テスト環境では何もしない
    return;
  }

  async invalidateAll() {
    // テスト環境では何もしない
    return;
  }

  async invalidatePattern(pattern: string) {
    // テスト環境では何もしない
    return;
  }
}