/**
 * テスト環境のグローバルセットアップ
 * 全テストで共通の設定とモックを提供
 */

import dotenv from 'dotenv';
import path from 'path';

// テスト環境変数の読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// 環境変数のデフォルト設定
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./test.db';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_DB = process.env.REDIS_DB || '1';

// グローバルモックの設定
global.console = {
  ...console,
  log: jest.fn(console.log),
  error: jest.fn(console.error),
  warn: jest.fn(console.warn),
  debug: jest.fn(),
};

// Dateのモック（テストの再現性のため）
const originalDate = Date;
global.Date = class extends originalDate {
  constructor(...args: any[]) {
    if (args.length === 0) {
      // テスト用の固定日時
      super('2025-01-09T00:00:00.000Z');
    } else {
      super(...args);
    }
  }
  
  static now() {
    return new originalDate('2025-01-09T00:00:00.000Z').getTime();
  }
} as any;

// タイマーのモック設定 - 個別のテストファイルで必要に応じて設定

// Redisクライアントのモック
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
    off: jest.fn(),
  })),
}));

// Prismaクライアントのモック
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    source: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    tag: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    articleTag: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn().mockImplementation(async (operations) => {
      // コールバック形式のトランザクションをサポート
      if (typeof operations === 'function') {
        return operations(mockPrismaClient);
      }
      // 配列形式のトランザクション（Promise.allのように動作）
      return Promise.all(operations);
    }),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, { code }: { code: string }) {
          super(message);
          this.code = code;
        }
      },
    },
  };
});

// fetch APIのモック（Node.js 18+）
if (!global.fetch) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Headers(),
    } as Response)
  );
}

// エラーハンドリングのヘルパー - 個別のテストで必要に応じて使用
export const suppressConsoleError = () => {
  const originalError = console.error;
  console.error = jest.fn();
  
  return () => {
    console.error = originalError;
  };
};

// 非同期処理の待機ヘルパー
export const waitForAsync = () => new Promise(resolve => setImmediate(resolve));

// テストデータのクリーンアップ
export const cleanupTestData = async () => {
  // テスト用データベースのクリーンアップ処理
  // 必要に応じて実装
};

export default {
  suppressConsoleError,
  waitForAsync,
  cleanupTestData,
};