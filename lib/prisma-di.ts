// Prismaクライアントの新しいエクスポート（DI対応）
import { PrismaClient } from '@prisma/client';
import { initializeDI, getPrismaClient } from './di';

// 初期化
if (process.env.NODE_ENV !== 'test') {
  initializeDI();
}

// Prismaクライアントを取得（遅延評価）
export function getPrisma(): PrismaClient {
  return getPrismaClient();
}

// 互換性のための既存エクスポート
export const prisma = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const client = getPrisma();
    return client[prop as keyof PrismaClient];
  },
});