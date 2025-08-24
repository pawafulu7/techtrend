/**
 * API モックヘルパー
 * MSW (Mock Service Worker) を使用した外部APIのモック
 */

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { faker } from '@faker-js/faker';

/**
 * よく使うAPIレスポンスのモックデータ
 */
export const mockApiResponses = {
  // Dev.to API
  devto: {
    articles: [
      {
        id: 1,
        title: 'Understanding TypeScript Generics',
        description: 'A comprehensive guide to TypeScript generics',
        url: 'https://dev.to/user/typescript-generics',
        published_at: '2025-01-09T00:00:00Z',
        positive_reactions_count: 42,
        reading_time_minutes: 5,
        tags: 'typescript,programming',
        user: {
          name: 'Test User',
          username: 'testuser',
        },
      },
    ],
  },
  
  // Qiita API
  qiita: {
    items: [
      {
        id: 'qiita-article-1',
        title: 'React 19の新機能まとめ',
        body: 'React 19で追加された新機能について解説します。',
        url: 'https://qiita.com/user/items/qiita-article-1',
        created_at: '2025-01-09T00:00:00+09:00',
        likes_count: 30,
        stocks_count: 15,
        tags: [
          { name: 'React', versions: [] },
          { name: 'JavaScript', versions: [] },
        ],
        user: {
          id: 'qiita-user',
          permanent_id: 123,
          profile_image_url: 'https://qiita.com/avatar.png',
        },
      },
    ],
  },
  
  // Zenn API
  zenn: {
    articles: [
      {
        id: 12345,
        post_type: 'Article',
        title: 'Next.js 15のApp Routerを完全理解する',
        slug: 'nextjs-15-app-router',
        published: true,
        comments_count: 5,
        liked_count: 25,
        body_letters_count: 5000,
        article_type: 'tech',
        emoji: '🚀',
        is_suspending_private: false,
        published_at: '2025-01-09T00:00:00.000+09:00',
        body_updated_at: '2025-01-09T00:00:00.000+09:00',
        source_repo_updated_at: null,
        path: '/user/articles/nextjs-15-app-router',
        user: {
          id: 12345,
          username: 'zennuser',
          name: 'Zenn User',
          avatar_small_url: 'https://zenn.dev/avatar.png',
        },
        publication: null,
      },
    ],
  },
  
  // GitHub API
  github: {
    repos: [
      {
        id: 1,
        name: 'awesome-project',
        full_name: 'user/awesome-project',
        description: 'An awesome project',
        html_url: 'https://github.com/user/awesome-project',
        stargazers_count: 1000,
        forks_count: 200,
        language: 'TypeScript',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-09T00:00:00Z',
      },
    ],
  },
  
  // Gemini API
  gemini: {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                summary: '## 概要\nテスト記事の要約です。\n\n## 主なポイント\n- ポイント1\n- ポイント2',
                tags: ['typescript', 'react'],
              }),
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
  },
};

/**
 * APIハンドラーの定義
 */
export const handlers = [
  // Dev.to API
  http.get('https://dev.to/api/articles', () => {
    return HttpResponse.json(mockApiResponses.devto.articles);
  }),
  
  // Qiita API  
  http.get('https://qiita.com/api/v2/items', () => {
    return HttpResponse.json(mockApiResponses.qiita.items);
  }),
  
  // Zenn トレンドフィード
  http.get('https://zenn.dev/api/articles', () => {
    return HttpResponse.json(mockApiResponses.zenn);
  }),
  
  // GitHub API
  http.get('https://api.github.com/search/repositories', () => {
    return HttpResponse.json({
      total_count: 1,
      items: mockApiResponses.github.repos,
    });
  }),
  
  // Gemini API
  http.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', () => {
    return HttpResponse.json(mockApiResponses.gemini);
  }),
  
  // RSS フィード（テキストレスポンス）
  http.get(/.*\.(rss|xml)$/, () => {
    return HttpResponse.text(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test RSS Feed</title>
          <link>https://test.example.com</link>
          <description>Test RSS Feed Description</description>
          <item>
            <title>Test Article</title>
            <link>https://test.example.com/article</link>
            <description>Test article description</description>
            <pubDate>Thu, 09 Jan 2025 00:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`);
  }),
  
  // デフォルトハンドラー（その他のリクエスト）
  http.get('*', () => {
    return HttpResponse.json({ message: 'Mocked response' });
  }),
  http.post('*', () => {
    return HttpResponse.json({ message: 'Mocked response' });
  }),
];

/**
 * MSWサーバーのセットアップ
 */
export const server = setupServer(...handlers);

/**
 * テスト前後の処理
 */
export const setupApiMocks = () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
};

/**
 * 特定のAPIレスポンスをモックする
 */
export const mockApiResponse = (
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  response: any,
  status = 200
) => {
  const httpMethod = http[method];
  server.use(
    httpMethod(url, () => {
      if (status >= 400) {
        return HttpResponse.json(response, { status });
      }
      return HttpResponse.json(response);
    })
  );
};

/**
 * APIエラーをモックする
 */
export const mockApiError = (
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  status = 500,
  message = 'Internal Server Error'
) => {
  const httpMethod = http[method];
  server.use(
    httpMethod(url, () => {
      return HttpResponse.json({ error: message }, { status });
    })
  );
};

/**
 * ネットワークエラーをモックする
 */
export const mockNetworkError = (url: string) => {
  server.use(
    http.get(url, () => {
      return HttpResponse.error();
    })
  );
};

/**
 * タイムアウトをモックする
 */
export const mockTimeout = (url: string, delay = 30000) => {
  server.use(
    http.get(url, async () => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return HttpResponse.json({});
    })
  );
};

/**
 * ランダムな記事データを生成
 */
export const generateMockArticles = (count: number) => {
  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    title: faker.lorem.sentence(),
    description: faker.lorem.paragraph(),
    url: faker.internet.url(),
    published_at: faker.date.recent().toISOString(),
    positive_reactions_count: faker.number.int({ min: 0, max: 100 }),
    reading_time_minutes: faker.number.int({ min: 1, max: 30 }),
    tags: faker.helpers.arrayElements(['javascript', 'typescript', 'react', 'nodejs', 'python'], 3).join(','),
    user: {
      name: faker.person.fullName(),
      username: faker.internet.userName(),
    },
  }));
};

/**
 * レート制限レスポンスをモックする
 */
export const mockRateLimit = (url: string) => {
  server.use(
    http.get(url, () => {
      return HttpResponse.json(
        { error: 'Rate limit exceeded' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + 3600000),
          },
        }
      );
    })
  );
};

/**
 * ページネーションレスポンスをモックする
 */
export const mockPaginatedResponse = (
  url: string,
  items: any[],
  _page = 1,
  perPage = 10
) => {
  server.use(
    http.get(url, ({ request }) => {
      const requestUrl = new URL(request.url);
      const requestPage = parseInt(requestUrl.searchParams.get('page') || '1');
      const requestPerPage = parseInt(requestUrl.searchParams.get('per_page') || String(perPage));
      
      const start = (requestPage - 1) * requestPerPage;
      const end = start + requestPerPage;
      const paginatedItems = items.slice(start, end);
      
      return HttpResponse.json(paginatedItems, {
        headers: {
          'X-Total-Count': String(items.length),
          'X-Page': String(requestPage),
          'X-Per-Page': String(requestPerPage),
          'Link': `<${url}?page=${requestPage + 1}>; rel="next"`,
        },
      });
    })
  );
};