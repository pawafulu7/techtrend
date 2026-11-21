/**
 * @jest-environment node
 */
import { checkGateAttempt } from '@/lib/auth/gate-attempt-limit';

const headersFrom = (ip: string): Headers =>
  new Headers({ 'x-forwarded-for': ip });

describe('checkGateAttempt', () => {
  it('失敗は 10 回まで通し、11 回目から解除までの秒数を返す', async () => {
    const headers = headersFrom('203.0.113.10');

    for (let i = 0; i < 10; i++) {
      await expect(checkGateAttempt(headers, 'failure')).resolves.toBeNull();
    }
    const retryAfter = await checkGateAttempt(headers, 'failure');

    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('成功は数えないが、締め出し中なら成功でも秒数を返す', async () => {
    const headers = headersFrom('203.0.113.11');

    for (let i = 0; i < 20; i++) {
      await expect(checkGateAttempt(headers, 'success')).resolves.toBeNull();
    }
    for (let i = 0; i < 11; i++) {
      await checkGateAttempt(headers, 'failure');
    }

    await expect(checkGateAttempt(headers, 'success')).resolves.toBeGreaterThan(
      0
    );
  });

  it('同じ /64 の IPv6 はまとめて数える（アドレスを変えて枠を増やせない）', async () => {
    for (let i = 0; i < 11; i++) {
      await checkGateAttempt(headersFrom(`2001:db8:1:2::${i + 1}`), 'failure');
    }

    await expect(
      checkGateAttempt(headersFrom('2001:db8:1:2::ffff'), 'success')
    ).resolves.toBeGreaterThan(0);
    await expect(
      checkGateAttempt(headersFrom('2001:db8:1:3::1'), 'success')
    ).resolves.toBeNull();
  });

  it('Redis の障害（Error）では締め出さずに通す', async () => {
    const failing = {
      points: 10,
      get: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
      consume: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
    };
    // SWC は export を再定義できない形にするので spyOn は使えない。モジュールごと差し替える
    let check!: typeof checkGateAttempt;
    jest.isolateModules(() => {
      jest.doMock('@/lib/middleware/rate-limiter', () => ({
        ...jest.requireActual('@/lib/middleware/rate-limiter'),
        createRateLimiterFromConfig: () => failing,
      }));
      check = require('@/lib/auth/gate-attempt-limit').checkGateAttempt;
    });

    const headers = headersFrom('203.0.113.12');
    await expect(check(headers, 'failure')).resolves.toBeNull();
    await expect(check(headers, 'success')).resolves.toBeNull();
    expect(failing.consume).toHaveBeenCalledTimes(1);
    expect(failing.get).toHaveBeenCalledTimes(1);
  });
});
