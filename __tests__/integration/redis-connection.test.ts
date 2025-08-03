import { getRedisClient, closeRedisConnection } from '@/lib/redis/client';

describe('Redis Connection', () => {
  afterAll(async () => {
    await closeRedisConnection();
  });

  it('should connect to Redis', async () => {
    const client = getRedisClient();
    const pong = await client.ping();
    expect(pong).toBe('PONG');
  });

  it('should set and get values', async () => {
    const client = getRedisClient();
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    expect(value).toBe('test-value');
  });

  it('should handle TTL correctly', async () => {
    const client = getRedisClient();
    await client.set('ttl-key', 'ttl-value', 'EX', 60);
    const ttl = await client.ttl('ttl-key');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('should delete keys', async () => {
    const client = getRedisClient();
    await client.set('delete-key', 'delete-value');
    const deleted = await client.del('delete-key');
    expect(deleted).toBe(1);
    const value = await client.get('delete-key');
    expect(value).toBeNull();
  });
});