export { container } from './container';
export { DI_TOKENS } from './types';
export type { IDIContainer, IProviders } from './types';

export { registerPrismaProvider, getPrismaClient, closePrismaConnection } from './providers/prisma.provider';
export { registerRedisProvider, getRedisClient, closeRedisConnection } from './providers/redis.provider';
export { registerTestProviders, resetTestProviders } from './providers/test.provider';

import { registerPrismaProvider } from './providers/prisma.provider';
import { registerRedisProvider } from './providers/redis.provider';

// アプリケーション起動時の初期化
export function initializeDI(): void {
  registerPrismaProvider();
  registerRedisProvider();
}

// テスト環境の初期化
export function initializeTestDI(): void {
  const { registerTestProviders } = require('./providers/test.provider');
  registerTestProviders();
}