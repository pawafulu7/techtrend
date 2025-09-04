/**
 * APIテスト用ユーティリティ
 * MSW v2の互換性問題を回避するため、簡易fetchモック方式を使用
 */

import { NextRequest } from 'next/server';

/**
 * APIルートハンドラーを直接テストするためのヘルパー関数
 */
export async function testApiHandler(
  handler: (req: NextRequest) => Promise<Response>,
  options: {
    method?: string;
    url?: string;
    headers?: HeadersInit;
    body?: any;
    params?: Record<string, string>;
    searchParams?: Record<string, string>;
  } = {}
) {
  const {
    method = 'GET',
    url = 'http://localhost:3000/api/test',
    headers = {},
    body,
    params = {},
    searchParams = {},
  } = options;

  // URLSearchParamsを構築
  const urlWithParams = new URL(url);
  Object.entries(searchParams).forEach(([key, value]) => {
    urlWithParams.searchParams.append(key, value);
  });

  // NextRequestを作成
  const request = new NextRequest(urlWithParams.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // nextUrlが未定義の場合は手動で設定（テスト環境対応）
  if (!request.nextUrl) {
    Object.defineProperty(request, 'nextUrl', {
      value: urlWithParams,
      writable: false,
      configurable: true
    });
  }

  // paramsを追加（Next.jsのルーティングパラメータ）
  (request as any).params = params;

  // ハンドラーを実行
  const response = await handler(request);

  // レスポンスを解析
  const responseBody = await response.text();
  let jsonBody;
  try {
    jsonBody = JSON.parse(responseBody);
  } catch {
    jsonBody = responseBody;
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: jsonBody,
    response,
  };
}

/**
 * モックデータベースクライアント
 */
export function createMockPrismaClient() {
  return {
    article: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    source: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    articleTag: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  };
}

/**
 * モックRedisクライアント
 */
export function createMockRedisClient() {
  const store = new Map<string, string>();
  
  return {
    get: jest.fn(async (key: string) => store.get(key) || null),
    set: jest.fn(async (key: string, value: string, ..._args: any[]) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      const deleted = store.delete(key);
      return deleted ? 1 : 0;
    }),
    exists: jest.fn(async (key: string) => store.has(key) ? 1 : 0),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 3600),
    keys: jest.fn(async (pattern: string) => {
      // Convert Redis glob pattern to regex safely
      // First escape all regex special chars, then handle Redis wildcards
      const regexPattern = '^' + pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
        .replace(/\\\*/g, '.*')  // Replace escaped * with .*
        .replace(/\\\?/g, '.')   // Replace escaped ? with .
        + '$';
      const regex = new RegExp(regexPattern);
      return Array.from(store.keys()).filter(key => regex.test(key));
    }),
    flushdb: jest.fn(async () => {
      store.clear();
      return 'OK';
    }),
    quit: jest.fn(async () => 'OK'),
  };
}

/**
 * テスト用のサンプルデータ生成
 */
export function generateSampleArticle(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2, 11),
    title: 'Sample Article Title',
    url: 'https://example.com/article',
    content: 'Sample article content for testing purposes.',
    summary: 'This is a sample article summary.',
    publishedAt: new Date().toISOString(),
    sourceId: 'sample-source',
    source: {
      id: 'sample-source',
      name: 'Sample Source',
      url: 'https://example.com',
      category: 'Technology',
    },
    tags: [
      { 
        tag: { 
          id: 'tag1', 
          name: 'JavaScript' 
        } 
      },
      { 
        tag: { 
          id: 'tag2', 
          name: 'Testing' 
        } 
      },
    ],
    imageUrl: null,
    author: 'Test Author',
    readingTime: 5,
    viewCount: 100,
    favoriteCount: 10,
    qualityScore: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function generateSampleSource(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name: 'Sample Source',
    url: 'https://example.com',
    category: 'Technology',
    description: 'A sample source for testing',
    iconUrl: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * APIレスポンスのアサーション用ヘルパー
 */
export function expectApiSuccess(response: any, expectedData?: any) {
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/json');
  
  if (expectedData) {
    expect(response.body).toEqual(expect.objectContaining(expectedData));
  }
}

export function expectApiError(response: any, statusCode: number, errorMessage?: string) {
  expect(response.status).toBe(statusCode);
  
  if (errorMessage) {
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining(errorMessage),
      })
    );
  }
}

/**
 * 非同期処理のテスト用ユーティリティ
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}