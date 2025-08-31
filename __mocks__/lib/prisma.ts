/**
 * Prismaクライアントのモック
 * jest-mock-extendedを使用した型安全な実装
 */

import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { jest } from '@jest/globals';

// Prismaクライアントのモック
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// モデルのモックを明示的に設定（Prismaスキーマの大文字小文字に合わせる）
(prismaMock.Article as any).findMany = jest.fn();
(prismaMock.Article as any).findFirst = jest.fn();
(prismaMock.Article as any).findUnique = jest.fn();
(prismaMock.Article as any).create = jest.fn();
(prismaMock.Article as any).update = jest.fn();
(prismaMock.Article as any).delete = jest.fn();
(prismaMock.Article as any).count = jest.fn();
(prismaMock.Article as any).upsert = jest.fn();

(prismaMock.ArticleView as any).findMany = jest.fn();
(prismaMock.ArticleView as any).findFirst = jest.fn();
(prismaMock.ArticleView as any).findUnique = jest.fn();
(prismaMock.ArticleView as any).create = jest.fn();
(prismaMock.ArticleView as any).update = jest.fn();
(prismaMock.ArticleView as any).updateMany = jest.fn();
(prismaMock.ArticleView as any).delete = jest.fn();
(prismaMock.ArticleView as any).upsert = jest.fn();

// 他のモデルも追加
(prismaMock.Source as any).findMany = jest.fn();
(prismaMock.Source as any).findUnique = jest.fn();
(prismaMock.Tag as any).findMany = jest.fn();
(prismaMock.User as any).findUnique = jest.fn();
(prismaMock.User as any).findFirst = jest.fn();

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
  (prismaMock.Article as any).findMany.mockClear();
  (prismaMock.Article as any).findFirst.mockClear();
  (prismaMock.Article as any).findUnique.mockClear();
  (prismaMock.Article as any).create.mockClear();
  (prismaMock.Article as any).update.mockClear();
  (prismaMock.Article as any).delete.mockClear();
  (prismaMock.Article as any).count.mockClear();
  (prismaMock.Article as any).upsert.mockClear();
  
  (prismaMock.ArticleView as any).findMany.mockClear();
  (prismaMock.ArticleView as any).findFirst.mockClear();
  (prismaMock.ArticleView as any).findUnique.mockClear();
  (prismaMock.ArticleView as any).create.mockClear();
  (prismaMock.ArticleView as any).update.mockClear();
  (prismaMock.ArticleView as any).updateMany.mockClear();
  (prismaMock.ArticleView as any).delete.mockClear();
  (prismaMock.ArticleView as any).upsert.mockClear();
  
  (prismaMock.Source as any).findMany.mockClear();
  (prismaMock.Source as any).findUnique.mockClear();
  (prismaMock.Tag as any).findMany.mockClear();
  (prismaMock.User as any).findUnique.mockClear();
  (prismaMock.User as any).findFirst.mockClear();
  
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