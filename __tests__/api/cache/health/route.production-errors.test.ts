/**
 * /api/cache/health: 本番では例外の文言を応答に入れない（issue #687）
 *
 * `@/lib/redis/client` へのモックは jest.config.node.js の moduleNameMapper により
 * __mocks__ 側のファイルに登録されるが、route の import は SWC の変換で相対パスになり、
 * 本物の lib/redis/client.ts を読む。そのため、route と同じ実ファイルを相対パスで差し替える。
 * テストごとに jest.doMock で差し替え、route を読み込み直す。
 */
import type { NextResponse } from 'next/server';

type HealthGet = () => Promise<NextResponse>;

const loadGet = (options: {
  ping?: () => Promise<string>;
  getStats?: () => unknown;
}): HealthGet => {
  let get: HealthGet | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../../../lib/redis/client', () => ({
      getRedisClient: () => ({
        ping: options.ping ?? (() => Promise.resolve('PONG')),
      }),
    }));
    jest.doMock('@/lib/cache/circuit-breaker', () => ({
      redisCircuitBreaker: {
        getStats:
          options.getStats ??
          (() => ({
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            consecutiveFailures: 0,
            lastFailureTime: null,
            nextRetryTime: null,
          })),
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    get = require('@/app/api/cache/health/route').GET;
  });
  if (!get) throw new Error('failed to load route');
  return get;
};

describe('/api/cache/health のエラー文言（issue #687）', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  it('本番では、Redis の ping の失敗の文言を返さない', async () => {
    process.env.NODE_ENV = 'production';
    const ping = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:6379'));
    const GET = loadGet({ ping });

    const data = await (await GET()).json();

    // 差し替えた ping の例外が route に届いたことを確かめる（届かないと別の例外で素通りする）
    expect(ping).toHaveBeenCalledTimes(1);
    expect(data.redis.connected).toBe(false);
    expect(data.redis.error).toBe('Redis ping failed');
    expect(JSON.stringify(data)).not.toContain('10.0.0.5');
  });

  it('本番では、予期しない例外の details を返さない', async () => {
    process.env.NODE_ENV = 'production';
    const getStats = jest.fn(() => {
      throw new Error('stats failed at 10.0.0.5');
    });
    const GET = loadGet({ getStats });

    const response = await GET();
    const data = await response.json();

    expect(getStats).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to perform health check');
    expect(data).not.toHaveProperty('details');
    expect(JSON.stringify(data)).not.toContain('10.0.0.5');
  });

  it('本番以外では、調査のために文言を返す', async () => {
    process.env.NODE_ENV = 'development';
    const ping = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:6379'));
    const GET = loadGet({ ping });

    const data = await (await GET()).json();

    expect(ping).toHaveBeenCalledTimes(1);
    expect(data.redis.error).toBe('connect ECONNREFUSED 10.0.0.5:6379');
  });
});
