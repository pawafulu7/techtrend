import type { SiteGateSettings } from '@/lib/auth/site-gate/config';
import {
  createGateAuthOptions,
  createValidateGateUserInfo,
  toGateAuthLogger,
  type GateAccess,
  type GateUserInfoHooks,
} from '@/lib/auth/site-gate/gate-auth-options';
import { GATE_DISABLED_PATHS } from '@/lib/auth/site-gate/disabled-paths';

const SETTINGS: SiteGateSettings = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  secret: 'g'.repeat(40),
  fixedEmails: ['owner@gmail.com'],
  baseOrigin: 'https://tt.example.com',
  isProduction: true,
};

const googleSource = {
  method: 'oauth' as const,
  action: 'sign-in' as const,
  oauth: { providerId: 'google' },
};

function hooks(access: GateAccess | Error = 'allowed') {
  const onRejected = jest.fn();
  const onUnavailable = jest.fn();
  const checkAccess = jest.fn(async () => {
    if (access instanceof Error) throw access;
    return access;
  });
  const value: GateUserInfoHooks = { checkAccess, onRejected, onUnavailable };
  return { value, checkAccess, onRejected, onUnavailable };
}

async function validate(
  h: GateUserInfoHooks,
  user: Record<string, unknown>,
  source: Record<string, unknown> = googleSource
) {
  const fn = createValidateGateUserInfo(h);
  // GenericEndpointContext は使わない
  return fn({ user, source } as never, {} as never);
}

describe('createValidateGateUserInfo', () => {
  it('allows a verified, allowed Gmail account and checks the normalized address', async () => {
    const h = hooks('allowed');
    await expect(
      validate(h.value, { email: 'F.riend@Gmail.com', emailVerified: true })
    ).resolves.toBeUndefined();
    expect(h.checkAccess).toHaveBeenCalledWith('friend@gmail.com');
  });

  it('rejects an address that is not allowed', async () => {
    const h = hooks('not_allowed');
    await expect(
      validate(h.value, { email: 'friend@gmail.com', emailVerified: true })
    ).resolves.toEqual({ error: 'not_allowed' });
    expect(h.onRejected).toHaveBeenCalledWith('not_allowed', 'f***@gmail.com');
  });

  it('rejects an unverified email before checking the allowlist', async () => {
    const h = hooks('allowed');
    await expect(
      validate(h.value, { email: 'friend@gmail.com', emailVerified: false })
    ).resolves.toEqual({ error: 'email_not_verified' });
    expect(h.checkAccess).not.toHaveBeenCalled();
  });

  it.each(['friend@example.com', 'friend+x@gmail.com', '', undefined])(
    'rejects non-Gmail email %p without logging the address',
    async (email) => {
      const h = hooks('allowed');
      await expect(
        validate(h.value, { email, emailVerified: true })
      ).resolves.toEqual({
        error: 'not_allowed',
      });
      expect(h.checkAccess).not.toHaveBeenCalled();
      expect(JSON.stringify(h.onRejected.mock.calls)).not.toContain('friend');
    }
  );

  it('rejects other providers', async () => {
    const h = hooks('allowed');
    await expect(
      validate(
        h.value,
        { email: 'friend@gmail.com', emailVerified: true },
        { method: 'oauth', action: 'sign-in', oauth: { providerId: 'github' } }
      )
    ).resolves.toEqual({ error: 'not_allowed' });
    await expect(
      validate(
        h.value,
        { email: 'friend@gmail.com', emailVerified: true },
        { method: 'email-password', action: 'create-user' }
      )
    ).resolves.toEqual({ error: 'not_allowed' });
    expect(h.checkAccess).not.toHaveBeenCalled();
  });

  it('turns DB failures into temporarily_unavailable instead of throwing', async () => {
    const error = new Error('connect ECONNREFUSED db.internal:5432');
    const h = hooks(error);
    await expect(
      validate(h.value, { email: 'friend@gmail.com', emailVerified: true })
    ).resolves.toEqual({ error: 'temporarily_unavailable' });
    expect(h.onUnavailable).toHaveBeenCalledWith(error);
  });
});

describe('toGateAuthLogger', () => {
  it('passes only the message, with addresses masked, and drops the arguments', () => {
    const log = jest.fn();
    const logger = toGateAuthLogger(log);
    logger.log?.(
      'error',
      'failed for friend@gmail.com',
      new Error('db.internal:5432')
    );
    expect(log).toHaveBeenCalledWith('error', 'failed for [email]');
    expect(logger.level).toBe('warn');
  });
});

describe('createGateAuthOptions', () => {
  const validateUserInfo = jest.fn();
  const logger = { level: 'warn' as const };
  const options = createGateAuthOptions(SETTINGS, { validateUserInfo, logger });

  it('uses the origin, the gate base path and its own secret only', () => {
    expect(options.baseURL).toBe('https://tt.example.com');
    expect(options.basePath).toBe('/api/gate');
    expect(options.secret).toBe(SETTINGS.secret);
    // secret だけだと BETTER_AUTH_SECRETS が優先されうるので、secrets も明示する
    expect(options.secrets).toEqual([{ version: 1, value: SETTINGS.secret }]);
  });

  it('has no database and keeps sessions for 7 days without refreshing them', () => {
    expect('database' in options).toBe(false);
    expect(options.session).toEqual({
      expiresIn: 7 * 24 * 60 * 60,
      disableSessionRefresh: true,
      // Cookie のキャッシュも作り直さない（期限はセッションと同じで、作り直しても延びない）
      cookieCache: { refreshCache: false },
    });
    expect(options.account).toEqual({ storeAccountCookie: false });
  });

  it('configures Google only, with account selection and without ID token sign-in', () => {
    expect(Object.keys(options.socialProviders)).toEqual(['google']);
    expect(options.socialProviders.google).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      prompt: 'select_account',
      disableIdTokenSignIn: true,
    });
  });

  it('separates cookies from the app sign-in and follows the production setting', () => {
    expect(options.advanced).toEqual({
      cookiePrefix: 'tt-gate',
      useSecureCookies: true,
    });
    const dev = createGateAuthOptions(
      { ...SETTINGS, isProduction: false },
      { validateUserInfo, logger }
    );
    expect(dev.advanced.useSecureCookies).toBe(false);
  });

  it('disables the built-in rate limit and does not customize the built-in error page', () => {
    expect(options.rateLimit).toEqual({ enabled: false });
    // 拒否・失敗のページは自前で返す（組み込みのページは disabledPaths で閉じる）
    expect('onAPIError' in options).toBe(false);
  });

  it('closes the fixed library paths, including the built-in error page, and keeps the callback', () => {
    expect(options.disabledPaths).toEqual([...GATE_DISABLED_PATHS]);
    expect(options.disabledPaths).toContain('/sign-in/social');
    expect(options.disabledPaths).toContain('/update-user');
    expect(options.disabledPaths).toContain('/error');
    expect(options.disabledPaths.some((p) => p.startsWith('/callback'))).toBe(
      false
    );
  });

  it('wires the user validation and the logger', () => {
    expect(options.user.validateUserInfo).toBe(validateUserInfo);
    expect(options.logger).toBe(logger);
  });
});
