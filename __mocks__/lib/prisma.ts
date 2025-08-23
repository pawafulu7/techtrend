/**
 * Prismaクライアントのモック
 * jest-mock-extendedを使用した型安全な実装
 */

import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

// Prismaクライアントのモック
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// デフォルトエクスポート
export const prisma = prismaMock;
export default prismaMock;

// リセット関数
export const resetPrismaMock = () => {
  mockReset(prismaMock);
};

// beforeEachで自動リセット（テスト環境でのみ実行）
if (typeof beforeEach !== 'undefined') {
  beforeEach(() => {
    resetPrismaMock();
  });
}