/**
 * Dev.to API テスト用モックヘルパー
 */

interface DevToMockArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  tag_list: string[] | string;
  user: {
    name: string;
    username: string;
  };
  cover_image: string | null;
  positive_reactions_count: number;
  comments_count: number;
  reading_time_minutes: number;
  body_html?: string;
  body_markdown?: string;
}

/**
 * Dev.to APIのモック実装を作成
 * @param articles モック記事データ
 * @param detailOverrides 詳細APIで上書きするデータ
 */
export function createDevToMockImplementation(
  articles: DevToMockArticle[],
  detailOverrides?: Partial<DevToMockArticle>
) {
  return (url: string) => {
    // 詳細APIのパターン（/articles/数字）
    if (url.match(/\/articles\/\d+$/)) {
      const articleId = parseInt(url.match(/\/(\d+)$/)?.[1] || '0');
      const article = articles.find(a => a.id === articleId) || articles[0];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ...article, ...detailOverrides }),
      });
    }

    // トップ記事API（top=7）
    if (url.includes('top=7')) {
      return Promise.resolve({
        ok: true,
        json: async () => articles,
      });
    }

    // タグ別API
    if (url.match(/tag=\w+/)) {
      // デフォルトでは空配列を返す（必要に応じてカスタマイズ可能）
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    }

    // リストAPI（/articles?クエリパラメータ）
    if (url.includes('/articles?')) {
      return Promise.resolve({
        ok: true,
        json: async () => articles,
      });
    }

    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  };
}

/**
 * シンプルなモック実装（mockResolvedValueOnce用）
 * @param listResponse リストAPIのレスポンス
 * @param detailResponse 詳細APIのレスポンス
 */
export function createSimpleDevToMocks(
  listResponse: any,
  detailResponse: any
) {
  return [
    {
      ok: true,
      json: async () => listResponse,
    },
    {
      ok: true,
      json: async () => detailResponse,
    },
  ];
}

/**
 * 標準的なテスト用記事データを生成
 */
export function createTestArticle(overrides?: Partial<DevToMockArticle>): DevToMockArticle {
  return {
    id: 1,
    title: 'Test Article',
    description: 'Test description',
    url: 'https://dev.to/test/article',
    published_at: '2025-01-01T00:00:00Z',
    tag_list: ['javascript', 'react', 'webdev'],
    user: { name: 'Test User', username: 'testuser' },
    cover_image: null,
    positive_reactions_count: 20,
    comments_count: 5,
    reading_time_minutes: 3,
    body_html: '<p>Article content</p>',
    ...overrides,
  };
}