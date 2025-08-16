// ioredisのモック
jest.mock('ioredis', () => {
  const mockStore = new Map();
  
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn((key, value, ...args) => {
      // 値をそのまま保存（文字列として扱う）
      mockStore.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn((key) => {
      return Promise.resolve(mockStore.get(key) || null);
    }),
    del: jest.fn((key) => {
      const existed = mockStore.has(key);
      mockStore.delete(key);
      return Promise.resolve(existed ? 1 : 0);
    }),
    ttl: jest.fn(() => Promise.resolve(59)),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }));
});

import { getRedisClient, closeRedisConnection } from '@/lib/redis/client';

describe('Redis Connection', () => {
  let client: any;

  beforeAll(() => {
    // Redisクライアントを取得
    client = getRedisClient();
  });

  afterAll(async () => {
    await closeRedisConnection();
  });

  it('should connect to Redis', async () => {
    const pong = await client.ping();
    expect(pong).toBe('PONG');
  });

  it('should set and get values', async () => {
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    expect(value).toBe('test-value');
  });

  it('should handle TTL correctly', async () => {
    await client.set('ttl-key', 'ttl-value', 'EX', 60);
    const ttl = await client.ttl('ttl-key');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('should delete keys', async () => {
    await client.set('delete-key', 'delete-value');
    const deleted = await client.del('delete-key');
    expect(deleted).toBe(1);
    const value = await client.get('delete-key');
    expect(value).toBeNull();
  });
});