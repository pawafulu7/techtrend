/**
 * Redis の命令の応答を待つ上限（commandTimeout）。接続が生きたまま応答が止まると、命令は既定では
 * 永遠に待ち、ホームの表示がソース・タグの取得で止まる（Redis を一時停止して確認した）。
 * lib/redis/ioredis-client.ts が上限を渡すことを確かめる。
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
  return args[args.length - 1] as {
    commandTimeout?: number;
    autoResendUnfulfilledCommands?: boolean;
    enableOfflineQueue?: boolean;
  };
}

beforeEach(() => {
  constructed.length = 0;
});

it('IoRedisClient は既定で命令の上限を渡す', () => {
  new IoRedisClient();
  expect(optionsOf(0).commandTimeout).toBe(REDIS_COMMAND_TIMEOUT_MS);
  expect(REDIS_COMMAND_TIMEOUT_MS).toBeGreaterThan(0);
});

it('上限で失敗にした命令を、再接続のときに送り直さない（接続前の待ち行列は残す）', () => {
  new IoRedisClient();
  expect(optionsOf(0).autoResendUnfulfilledCommands).toBe(false);
  expect(optionsOf(0).enableOfflineQueue).toBe(true);
});

it('IoRedisClient は設定で上限を変えられる', () => {
  new IoRedisClient({ commandTimeout: 250 });
  expect(optionsOf(0).commandTimeout).toBe(250);
});
