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

// DNS解決のモック（Issue #633 SSRF guard: lib/utils/url/ssrf-guard.ts が
// dns.promises.lookup を使用する）。多数の enricher テストが実在ドメイン
// （zenn.dev, speakerdeck.com 等）に対して global.fetch のみをモックしており、
// 実 DNS 解決に依存すると CI で不安定になる（ネットワーク遮断環境で全滅もありうる）。
// デフォルトでは安全な公開IP（RFC 5737 TEST-NET-3、実在しないが SSRF guard の
// 拒否レンジには該当しない）を返す。SSRF guard 自体の拒否ケースを検証するテストは
// (dns.promises.lookup as jest.Mock).mockResolvedValueOnce(...) 等で個別に上書きする。
jest.mock('dns', () => {
  const actual = jest.requireActual('dns');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: jest
        .fn()
        .mockResolvedValue([{ address: '203.0.113.10', family: 4 }]),
    },
  };
});

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
