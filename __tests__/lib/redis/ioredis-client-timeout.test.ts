/**
 * Redis の命令の応答を待つ上限（commandTimeout）。接続が生きたまま応答が止まると、命令は既定では
 * 永遠に待ち、ホームの表示がソース・タグ・帯の取得で止まる（Redis を一時停止して確認した）。
 * どちらのクライアント（lib/redis/ioredis-client.ts と DI の redis.provider）も上限を渡すことを確かめる。
 */
const constructed: Array<{ args: unknown[] }> = [];
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation((...args: unknown[]) => {
    constructed.push({ args });
    return { on: jest.fn(), quit: jest.fn() };
  });
});
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('@/lib/config/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', REDIS_PORT: '6379' },
}));

import {
  IoRedisClient,
  REDIS_COMMAND_TIMEOUT_MS,
} from '@/lib/redis/ioredis-client';

function optionsOf(index: number) {
  const { args } = constructed[index];
  return args[args.length - 1] as { commandTimeout?: number };
}

beforeEach(() => {
  constructed.length = 0;
});

it('IoRedisClient は既定で命令の上限を渡す', () => {
  new IoRedisClient();
  expect(optionsOf(0).commandTimeout).toBe(REDIS_COMMAND_TIMEOUT_MS);
  expect(REDIS_COMMAND_TIMEOUT_MS).toBeGreaterThan(0);
});

it('IoRedisClient は設定で上限を変えられる', () => {
  new IoRedisClient({ commandTimeout: 250 });
  expect(optionsOf(0).commandTimeout).toBe(250);
});

it('DI の Redis も同じ上限を渡す', () => {
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      registerRedisProvider,
      getRedisClient,
    } = require('@/lib/di/providers/redis.provider');
    registerRedisProvider();
    getRedisClient();
  });
  expect(optionsOf(constructed.length - 1).commandTimeout).toBe(
    REDIS_COMMAND_TIMEOUT_MS
  );
});
