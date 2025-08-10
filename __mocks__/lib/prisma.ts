/**
 * Prismaクライアントのモック
 * 自動モックではなくManual Mockとして実装
 */

import { PrismaClient } from '@prisma/client';

// モック関数のヘルパー型
type DeepMockProxy<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.MockedFunction<T[K]>
    : T[K] extends object
    ? DeepMockProxy<T[K]>
    : T[K];
};

// Prismaクライアントの基本モック構造を作成
function createBasePrismaClient(): DeepMockProxy<PrismaClient> {
  return {
    article: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    source: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    tag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    articleTag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    favorite: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    $use: jest.fn(),
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  } as any;
}

// グローバルなPrismaモックインスタンス
export const prismaMock = createBasePrismaClient();

// beforeEachフックでモックをリセット
beforeEach(() => {
  // 全てのモック関数をクリア
  Object.keys(prismaMock).forEach(key => {
    const model = prismaMock[key as keyof typeof prismaMock];
    if (model && typeof model === 'object') {
      Object.keys(model).forEach(method => {
        const fn = (model as any)[method];
        if (typeof fn === 'function' && fn.mockClear) {
          fn.mockClear();
        }
      });
    } else if (typeof model === 'function' && (model as any).mockClear) {
      (model as any).mockClear();
    }
  });
});

// デフォルトエクスポート
export default prismaMock;