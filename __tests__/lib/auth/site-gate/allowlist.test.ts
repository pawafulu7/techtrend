import {
  checkGateEmailAccess,
  GateAllowlistUnavailableError,
  resetGateAllowlistStateForTests,
} from '@/lib/auth/site-gate/allowlist';
import { prisma } from '@/lib/prisma';

const findUnique = prisma.gateAllowedEmail.findUnique as unknown as jest.Mock;

const FIXED = ['owner@gmail.com'];
const ROW_CREATED_AT = new Date('2026-11-20T00:00:00Z');

function rowResult(createdAt: Date = ROW_CREATED_AT) {
  return { createdAt };
}

describe('checkGateEmailAccess', () => {
  beforeEach(() => {
    resetGateAllowlistStateForTests();
    findUnique.mockReset();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows a fixed email without reading the DB, even when the DB fails', async () => {
    findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      checkGateEmailAccess(' Owner@Gmail.com ', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
    await expect(
      checkGateEmailAccess('o.w.n.e.r@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects non-Gmail addresses without reading the DB', async () => {
    await expect(
      checkGateEmailAccess('friend@example.com', { fixedEmails: FIXED })
    ).resolves.toBe('not_allowed');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks up the normalized address by the unique index', async () => {
    findUnique.mockResolvedValue(rowResult());
    await expect(
      checkGateEmailAccess('F.riend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'friend@gmail.com' },
      select: { createdAt: true },
    });
  });

  it('caches only allowed results for 30 seconds', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-21T00:00:00Z') });
    findUnique.mockResolvedValue(rowResult());
    await checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED });
    await checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED });
    expect(findUnique).toHaveBeenCalledTimes(1);

    // 外された（行が無い）としても、30 秒の間は許可の結果が残る
    findUnique.mockResolvedValue(null);
    jest.setSystemTime(new Date('2026-11-21T00:00:29Z'));
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
    expect(findUnique).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-11-21T00:00:31Z'));
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('not_allowed');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejections, so an address added later is allowed immediately', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(rowResult());
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('not_allowed');
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('shares one DB lookup between concurrent checks of the same address', async () => {
    let resolveRow!: (value: unknown) => void;
    findUnique.mockReturnValue(
      new Promise((resolve) => {
        resolveRow = resolve;
      })
    );
    const checks = Array.from({ length: 10 }, () =>
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    );
    resolveRow(rowResult());
    await expect(Promise.all(checks)).resolves.toEqual(
      Array(10).fill('allowed')
    );
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('throws on DB errors and remembers the failure for 5 seconds', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-21T00:00:00Z') });
    findUnique.mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal:5432')
    );
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).rejects.toBeInstanceOf(GateAllowlistUnavailableError);
    expect(findUnique).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-11-21T00:00:04Z'));
    await expect(
      checkGateEmailAccess('another@gmail.com', { fixedEmails: FIXED })
    ).rejects.toBeInstanceOf(GateAllowlistUnavailableError);
    expect(findUnique).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-11-21T00:00:06Z'));
    findUnique.mockResolvedValue(rowResult());
    await expect(
      checkGateEmailAccess('another@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('allowed');
  });

  it('does not put the DB error message into its own message', async () => {
    findUnique.mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal:5432')
    );
    const error = await checkGateEmailAccess('friend@gmail.com', {
      fixedEmails: FIXED,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GateAllowlistUnavailableError);
    expect((error as Error).message).not.toContain('db.internal');
  });

  it('times out after DB_CONNECT_TIMEOUT (10 seconds by default)', async () => {
    jest.useFakeTimers();
    findUnique.mockReturnValue(new Promise(() => {}));
    const check = checkGateEmailAccess('friend@gmail.com', {
      fixedEmails: FIXED,
    });
    const settled = check.catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(9_999);
    let done = false;
    void settled.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    await expect(settled).resolves.toBeInstanceOf(
      GateAllowlistUnavailableError
    );
  });

  it('counts the cache lifetime from when the lookup started, not when it finished', async () => {
    // 外す直前に始まった照合が遅れて返っても、外してから 30 秒より長く許可を持たないように
    jest.useFakeTimers({ now: new Date('2026-11-21T00:00:00Z') });
    let resolveRow!: (value: unknown) => void;
    findUnique.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRow = resolve;
      })
    );
    const check = checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED });
    jest.setSystemTime(new Date('2026-11-21T00:00:08Z'));
    resolveRow(rowResult());
    await expect(check).resolves.toBe('allowed');

    // 照合を始めてから 31 秒（返ってからは 23 秒）。キャッシュは切れていて、DB を引き直す
    findUnique.mockResolvedValue(null);
    jest.setSystemTime(new Date('2026-11-21T00:00:31Z'));
    await expect(
      checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED })
    ).resolves.toBe('not_allowed');
  });

  describe('足し直した行より前のログイン状態', () => {
    it('treats a session created before the row as stale', async () => {
      findUnique.mockResolvedValue(rowResult(new Date('2026-11-20T00:10:00Z')));
      await expect(
        checkGateEmailAccess('friend@gmail.com', {
          fixedEmails: FIXED,
          sessionCreatedAt: new Date('2026-11-20T00:09:54Z'),
        })
      ).resolves.toBe('stale_session');
    });

    it('allows within the 5 second clock skew', async () => {
      findUnique.mockResolvedValue(rowResult(new Date('2026-11-20T00:10:00Z')));
      await expect(
        checkGateEmailAccess('friend@gmail.com', {
          fixedEmails: FIXED,
          sessionCreatedAt: new Date('2026-11-20T00:09:56Z'),
        })
      ).resolves.toBe('allowed');
    });

    it('applies the same check to cached results', async () => {
      findUnique.mockResolvedValue(rowResult(new Date('2026-11-20T00:10:00Z')));
      await checkGateEmailAccess('friend@gmail.com', { fixedEmails: FIXED });
      await expect(
        checkGateEmailAccess('friend@gmail.com', {
          fixedEmails: FIXED,
          sessionCreatedAt: new Date('2026-11-19T00:00:00Z'),
        })
      ).resolves.toBe('stale_session');
      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('does not apply to fixed emails', async () => {
      await expect(
        checkGateEmailAccess('owner@gmail.com', {
          fixedEmails: FIXED,
          sessionCreatedAt: new Date('2000-01-01T00:00:00Z'),
        })
      ).resolves.toBe('allowed');
    });
  });
});
