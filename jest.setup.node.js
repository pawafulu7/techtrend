// Node.js環境用のセットアップ
import '@testing-library/jest-dom';
import { RedisMockFactory } from './test/factories/redis-mock-factory';
import { CacheMockFactory } from './test/factories/cache-mock-factory';
import { initializeTestDI, resetTestProviders } from './lib/di/testing';
const { prismaMock, resetPrismaMock } = require('./test/utils/prisma-mock');
// Polyfill for web File/Blob in Node test environment
try {
   
  const undici = require('undici');
  if (undici?.File && !global.File) {
    // @ts-ignore
    global.File = undici.File;
  }
  if (undici?.Blob && !global.Blob) {
    // @ts-ignore
    global.Blob = undici.Blob;
  }
} catch (_) {
  // ignore if undici is unavailable here
}

// Redisクライアントのモックは__mocks__ディレクトリから自動的に読み込まれる
jest.mock('@/lib/redis/client');

// Prisma Clientのモック
jest.mock('@/lib/prisma-exports', () => {
  const actual = jest.requireActual('@/lib/prisma-exports');
  return {
    ...actual,
    PrismaClient: jest.fn(() => prismaMock),
  };
});

// Better Auth のモック（auth.ts のトップレベル side effect を回避）
jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn().mockResolvedValue(null),
      revokeSessions: jest.fn().mockResolvedValue(undefined),
    },
    handler: jest.fn(),
  },
}));

jest.mock('@/lib/auth/get-session', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  getRequiredSession: jest.fn().mockRejectedValue(new Error('Unauthorized')),
}));

// テスト環境のDI初期化
beforeAll(() => {
  initializeTestDI();
});

// 各テストの前にモックをリセット
beforeEach(() => {
  RedisMockFactory.reset();
  CacheMockFactory.reset();
  resetTestProviders();
  resetPrismaMock();

});

// グローバルfetchのモック（Node環境用）
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    headers: new Map(),
  })
);

// Next.jsのレスポンスモック
global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? 'OK';
    // Use Headers polyfill for case-insensitive header access (CodexMCP recommended)
    this.headers = init.headers instanceof Headers
      ? new Headers(init.headers)
      : new Headers(init.headers ?? {});
    this.ok = this.status >= 200 && this.status < 300;
  }
  
  json() {
    if (typeof this.body === 'string') {
      return Promise.resolve(JSON.parse(this.body));
    }
    return Promise.resolve(this.body);
  }
  
  text() {
    if (typeof this.body === 'string') {
      return Promise.resolve(this.body);
    }
    return Promise.resolve(JSON.stringify(this.body));
  }
  
  clone() {
    return new Response(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers)
    });
  }
};

// console.errorを抑制（テスト時のノイズを減らす）
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Not implemented') ||
       args[0].includes('Warning:'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// モックのクリーンアップ
afterEach(() => {
  jest.clearAllMocks();
});
