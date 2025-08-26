/**
 * Prismaクライアントのモック
 * jest-mock-extendedを使用した型安全な実装
 */

import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { jest } from '@jest/globals';

// Prismaクライアントのモック
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// モデルのモックを明示的に設定
(prismaMock.article as any).findMany = jest.fn();
(prismaMock.article as any).findFirst = jest.fn();
(prismaMock.article as any).findUnique = jest.fn();
(prismaMock.article as any).create = jest.fn();
(prismaMock.article as any).update = jest.fn();
(prismaMock.article as any).delete = jest.fn();
(prismaMock.article as any).count = jest.fn();
(prismaMock.article as any).upsert = jest.fn();

(prismaMock.articleView as any).findMany = jest.fn();
(prismaMock.articleView as any).findFirst = jest.fn();
(prismaMock.articleView as any).findUnique = jest.fn();
(prismaMock.articleView as any).create = jest.fn();
(prismaMock.articleView as any).update = jest.fn();
(prismaMock.articleView as any).updateMany = jest.fn();
(prismaMock.articleView as any).delete = jest.fn();
(prismaMock.articleView as any).upsert = jest.fn();

// $queryRawと$executeRawを明示的にjest.fn()として定義
(prismaMock as any).$queryRaw = jest.fn();
(prismaMock as any).$executeRaw = jest.fn();
(prismaMock as any).$transaction = jest.fn();

// デフォルトエクスポート
export const prisma = prismaMock;
export default prismaMock;

// リセット関数
export const resetPrismaMock = () => {
  mockReset(prismaMock);
  // 手動で追加したモックもリセット
  (prismaMock.article as any).findMany.mockClear();
  (prismaMock.article as any).findFirst.mockClear();
  (prismaMock.article as any).findUnique.mockClear();
  (prismaMock.article as any).create.mockClear();
  (prismaMock.article as any).update.mockClear();
  (prismaMock.article as any).delete.mockClear();
  (prismaMock.article as any).count.mockClear();
  (prismaMock.article as any).upsert.mockClear();
  
  (prismaMock.articleView as any).findMany.mockClear();
  (prismaMock.articleView as any).findFirst.mockClear();
  (prismaMock.articleView as any).findUnique.mockClear();
  (prismaMock.articleView as any).create.mockClear();
  (prismaMock.articleView as any).update.mockClear();
  (prismaMock.articleView as any).updateMany.mockClear();
  (prismaMock.articleView as any).delete.mockClear();
  (prismaMock.articleView as any).upsert.mockClear();
  
  (prismaMock as any).$queryRaw.mockClear();
  (prismaMock as any).$executeRaw.mockClear();
  (prismaMock as any).$transaction.mockClear();
};

// beforeEachで自動リセット（テスト環境でのみ実行）
if (typeof beforeEach !== 'undefined') {
  beforeEach(() => {
    resetPrismaMock();
  });
}