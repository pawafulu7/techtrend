/**
 * @jest-environment node
 */
import { betterAuthRateLimitStorage } from '@/lib/auth/rate-limit-storage';

describe('betterAuthRateLimitStorage', () => {
  it('規則の回数までは通し、超えたら解除までの秒数を返す', async () => {
    const rule = { window: 10, max: 3 };
    const key = '203.0.113.30|/sign-in/email';

    for (let i = 0; i < 3; i++) {
      await expect(betterAuthRateLimitStorage.consume(key, rule)).resolves.toEqual({
        allowed: true,
        retryAfter: null,
      });
    }
    const denied = await betterAuthRateLimitStorage.consume(key, rule);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(denied.retryAfter).toBeLessThanOrEqual(10);
  });

  it('キー（IP と経路）ごとに別々に数える', async () => {
    const rule = { window: 60, max: 1 };

    await betterAuthRateLimitStorage.consume('203.0.113.31|/sign-up/email', rule);
    const sameKey = await betterAuthRateLimitStorage.consume('203.0.113.31|/sign-up/email', rule);
    const otherIp = await betterAuthRateLimitStorage.consume('203.0.113.32|/sign-up/email', rule);

    expect(sameKey.allowed).toBe(false);
    expect(otherIp.allowed).toBe(true);
  });

  it('Redis の障害（Error）では数えずに通す', async () => {
    // SWC は export を再定義できない形にするので spyOn は使えない。モジュールごと差し替える
    let storage!: typeof betterAuthRateLimitStorage;
    jest.isolateModules(() => {
      jest.doMock('@/lib/middleware/rate-limiter', () => ({
        ...jest.requireActual('@/lib/middleware/rate-limiter'),
        createRateLimiter: () => ({
          consume: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
        }),
      }));
      storage = require('@/lib/auth/rate-limit-storage').betterAuthRateLimitStorage;
    });

    await expect(
      storage.consume('203.0.113.33|/sign-in/email', { window: 10, max: 3 })
    ).resolves.toEqual({ allowed: true, retryAfter: null });
  });
});
