/**
 * Prismaクライアントのモック
 * jest-mock-extendedを使用した型安全な実装
 */

import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { jest } from '@jest/globals';

// Prismaクライアントのモック
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

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