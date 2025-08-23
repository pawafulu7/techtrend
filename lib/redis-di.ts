// Redisクライアントの新しいエクスポート（DI対応）
import { Redis } from 'ioredis';
import { initializeDI, getRedisClient as getRedisFromDI } from './di';

// 初期化
if (process.env.NODE_ENV !== 'test') {
  initializeDI();
}

// Redisクライアントを取得
export function getRedisClient(): Redis | null {
  return getRedisFromDI();
}