/**
 * LayeredCache のモック実装
 * テスト環境では実際のキャッシュではなく、
 * 直接データフェッチャーを呼び出す
 */

export class LayeredCache {
  constructor() {}

  async getArticles(params: any, fetcher: () => Promise<any>) {
    // テスト環境では常にフェッチャーを実行（キャッシュを使わない）
    console.log('LayeredCache.getArticles called with params:', params);
    const result = await fetcher();
    console.log('LayeredCache.getArticles fetcher result:', result);
    return result;
  }

  async getOrFetch(key: string, fetcher: () => Promise<any>) {
    // テスト環境では常にフェッチャーを実行（キャッシュを使わない）
    return await fetcher();
  }

  async set(key: string, value: any, ttl?: number) {
    // テスト環境では何もしない
    return;
  }

  async del(key: string) {
    // テスト環境では何もしない
    return;
  }

  async clear() {
    // テスト環境では何もしない
    return;
  }
}

// ArticleQueryParams型の定義（実際の型と同じ）
export interface ArticleQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  sources?: string;
  sourceId?: string;
  tag?: string;
  tags?: string;
  tagMode?: string;
  search?: string;
  dateRange?: string;
  readFilter?: string;
  userId?: string;
  category?: string;
  includeRelations?: boolean;
  includeEmptyContent?: boolean;
  lightweight?: boolean;
  fields?: string;
}