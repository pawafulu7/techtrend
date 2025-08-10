/**
 * モックヘルパー関数
 * Prisma、Redis、APIテスト用のモックユーティリティ
 */

import { NextRequest, NextResponse } from 'next/server';
// Manual mocksを直接インポート
import prismaMock from '../../__mocks__/lib/prisma';
import redisMock from '../../__mocks__/lib/redis/client';

/**
 * APIルートハンドラーテスト用のモックリクエスト作成
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    searchParams?: Record<string, string>;
  } = {}
): NextRequest {
  const fullUrl = new URL(url, 'http://localhost:3000');
  
  // クエリパラメータを追加
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      fullUrl.searchParams.set(key, value);
    });
  }
  
  const init: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  
  // BODYがある場合はJSON文字列化
  if (options.body) {
    init.body = JSON.stringify(options.body);
  }
  
  return new NextRequest(fullUrl.toString(), init);
}

/**
 * APIルートハンドラーテスト用のコンテキスト作成
 */
export function createMockContext(params: Record<string, string> = {}) {
  return { params };
}

/**
 * NextResponseのモックヘルパー
 */
export async function parseResponse(response: NextResponse) {
  const text = await response.text();
  
  try {
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: JSON.parse(text),
    };
  } catch {
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text,
    };
  }
}

/**
 * Prismaモックのセットアップ
 */
export function setupPrismaMock() {
  // 各モデルの基本的なモック設定
  prismaMock.article.findMany.mockResolvedValue([]);
  prismaMock.article.count.mockResolvedValue(0);
  prismaMock.article.findUnique.mockResolvedValue(null);
  prismaMock.article.findFirst.mockResolvedValue(null);
  
  prismaMock.source.findMany.mockResolvedValue([]);
  prismaMock.source.count.mockResolvedValue(0);
  prismaMock.source.findUnique.mockResolvedValue(null);
  
  prismaMock.tag.findMany.mockResolvedValue([]);
  prismaMock.tag.count.mockResolvedValue(0);
  
  // トランザクションのモック
  prismaMock.$transaction.mockImplementation(async (callback: any) => {
    if (typeof callback === 'function') {
      return callback(prismaMock);
    }
    // 配列の場合（複数のPromise）
    return Promise.all(callback);
  });
  
  return prismaMock;
}

/**
 * Redisモックのセットアップ
 */
export function setupRedisMock() {
  // 基本的なモック設定
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue('OK');
  redisMock.setex.mockResolvedValue('OK');
  redisMock.del.mockResolvedValue(1);
  redisMock.exists.mockResolvedValue(0);
  redisMock.expire.mockResolvedValue(1);
  redisMock.ttl.mockResolvedValue(-2);
  redisMock.keys.mockResolvedValue([]);
  
  // パイプラインのモック
  const pipelineMock = {
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  redisMock.pipeline.mockReturnValue(pipelineMock as any);
  
  return redisMock;
}

/**
 * APIレスポンスのアサーションヘルパー
 */
export function expectApiSuccess(
  response: { status: number; body: any },
  expectedStatus = 200
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toBeDefined();
  
  // エラーレスポンスでないことを確認
  if (response.body && typeof response.body === 'object') {
    expect(response.body.error).toBeUndefined();
  }
}

/**
 * APIエラーレスポンスのアサーションヘルパー
 */
export function expectApiError(
  response: { status: number; body: any },
  expectedStatus: number,
  errorMessage?: string | RegExp
) {
  expect(response.status).toBe(expectedStatus);
  
  if (response.body && typeof response.body === 'object') {
    expect(response.body.error).toBeDefined();
    
    if (errorMessage) {
      if (typeof errorMessage === 'string') {
        expect(response.body.error).toContain(errorMessage);
      } else {
        expect(response.body.error).toMatch(errorMessage);
      }
    }
  }
}

/**
 * ページネーションレスポンスのアサーション
 */
export function expectPaginationResponse(
  response: { body: any },
  expectedProperties: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  } = {}
) {
  expect(response.body).toHaveProperty('total');
  expect(response.body).toHaveProperty('page');
  expect(response.body).toHaveProperty('limit');
  
  if (expectedProperties.total !== undefined) {
    expect(response.body.total).toBe(expectedProperties.total);
  }
  if (expectedProperties.page !== undefined) {
    expect(response.body.page).toBe(expectedProperties.page);
  }
  if (expectedProperties.limit !== undefined) {
    expect(response.body.limit).toBe(expectedProperties.limit);
  }
  if (expectedProperties.hasMore !== undefined) {
    expect(response.body.hasMore).toBe(expectedProperties.hasMore);
  }
}

/**
 * キャッシュ動作のアサーション
 */
export function expectCacheHit(redisMock: any, cacheKey: string) {
  expect(redisMock.get).toHaveBeenCalledWith(cacheKey);
}

export function expectCacheSet(
  redisMock: any,
  cacheKey: string,
  ttl?: number
) {
  if (ttl) {
    expect(redisMock.setex).toHaveBeenCalledWith(
      cacheKey,
      ttl,
      expect.any(String)
    );
  } else {
    expect(redisMock.set).toHaveBeenCalledWith(
      cacheKey,
      expect.any(String)
    );
  }
}

export function expectCacheInvalidation(redisMock: any, pattern?: string) {
  if (pattern) {
    expect(redisMock.keys).toHaveBeenCalledWith(pattern);
    expect(redisMock.del).toHaveBeenCalled();
  } else {
    expect(redisMock.del).toHaveBeenCalled();
  }
}

/**
 * データベース操作のアサーション
 */
export function expectDatabaseQuery(
  prismaMock: any,
  model: string,
  method: string,
  expectedArgs?: any
) {
  const modelMock = prismaMock[model];
  expect(modelMock).toBeDefined();
  
  const methodMock = modelMock[method];
  expect(methodMock).toHaveBeenCalled();
  
  if (expectedArgs) {
    expect(methodMock).toHaveBeenCalledWith(expectedArgs);
  }
}

/**
 * トランザクションのアサーション
 */
export function expectTransaction(prismaMock: any) {
  expect(prismaMock.$transaction).toHaveBeenCalled();
}

/**
 * モックのリセットヘルパー
 */
export function resetAllMocks() {
  jest.clearAllMocks();
  
  // Prismaモックのリセット
  if (prismaMock) {
    Object.keys(prismaMock).forEach(key => {
      const model = prismaMock[key as keyof typeof prismaMock];
      if (model && typeof model === 'object') {
        Object.keys(model).forEach(method => {
          const fn = (model as any)[method];
          if (typeof fn === 'function' && fn.mockClear) {
            fn.mockClear();
          }
        });
      }
    });
  }
  
  // Redisモックのリセット
  if (redisMock) {
    Object.keys(redisMock).forEach(key => {
      const method = (redisMock as any)[key];
      if (typeof method === 'function' && method.mockClear) {
        method.mockClear();
      }
    });
  }
}

/**
 * テストAPIハンドラー
 * Next.js App RouterのAPIルートハンドラーをテストするためのユーティリティ
 */
export async function testApiHandler(
  handler: Function,
  options: {
    url?: string;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    searchParams?: Record<string, string>;
    params?: Record<string, string>;
  } = {}
) {
  const request = createMockRequest(
    options.url || 'http://localhost:3000/api/test',
    {
      method: options.method,
      body: options.body,
      headers: options.headers,
      searchParams: options.searchParams,
    }
  );
  
  const context = createMockContext(options.params);
  const response = await handler(request, context);
  
  return parseResponse(response);
}