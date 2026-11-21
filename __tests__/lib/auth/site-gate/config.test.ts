import {
  isSiteGateEnabled,
  resolveSiteGateConfig,
  type SiteGateRawEnv,
} from '@/lib/auth/site-gate/config';
import { maskGateEmail, normalizeGateEmail } from '@/lib/auth/site-gate/email';

const GATE_SECRET = 'g'.repeat(40);
const APP_SECRET = 'a'.repeat(40);

function rawEnv(overrides: Partial<SiteGateRawEnv> = {}): SiteGateRawEnv {
  return {
    GATE_GOOGLE_ENABLED: 'true',
    GATE_GOOGLE_CLIENT_ID: 'client-id',
    GATE_GOOGLE_CLIENT_SECRET: 'client-secret',
    GATE_AUTH_SECRET: GATE_SECRET,
    GATE_ALWAYS_ALLOWED_EMAILS: 'Owner.Name@gmail.com',
    AUTH_SECRET: APP_SECRET,
    NODE_ENV: 'development',
    ...overrides,
  };
}

function reasonOf(raw: SiteGateRawEnv): string {
  const config = resolveSiteGateConfig(raw);
  if (config.kind !== 'misconfigured') {
    throw new Error(`expected misconfigured, got ${config.kind}`);
  }
  return config.reason;
}

describe('normalizeGateEmail', () => {
  it.each([
    ['friend@gmail.com', 'friend@gmail.com'],
    ['  Friend@Gmail.COM ', 'friend@gmail.com'],
    // Gmail はローカル部のドットを区別しないので、除いた形にそろえる
    ['f.r.i.e.n.d@gmail.com', 'friend@gmail.com'],
    ['john.smith99@gmail.com', 'johnsmith99@gmail.com'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeGateEmail(raw)).toBe(expected);
  });

  it.each([
    ['plus', 'friend+tag@gmail.com'],
    ['other domain', 'friend@example.com'],
    ['googlemail', 'friend@googlemail.com'],
    ['subdomain', 'friend@mail.gmail.com'],
    ['control char', 'fri\u0000end@gmail.com'],
    ['inner space', 'fri end@gmail.com'],
    ['inner line separator', 'fri\u2028end@gmail.com'],
    ['inner newline', 'fri\nend@gmail.com'],
    ['only dots', '...@gmail.com'],
    ['empty', ''],
    ['non ascii', 'frİend@gmail.com'],
    ['too long', `${'a'.repeat(245)}@gmail.com`],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeGateEmail(raw)).toBeNull();
  });

  it('accepts 254 characters and rejects 255', () => {
    const local244 = 'a'.repeat(254 - '@gmail.com'.length);
    expect(normalizeGateEmail(`${local244}@gmail.com`)).toBe(`${local244}@gmail.com`);
    expect(normalizeGateEmail(`a${local244}@gmail.com`)).toBeNull();
  });

  it('masks the local part for logs', () => {
    expect(maskGateEmail('friend@gmail.com')).toBe('f***@gmail.com');
    expect(maskGateEmail('broken')).toBe('***');
  });
});

describe('resolveSiteGateConfig', () => {
  it('returns enabled settings with normalized fixed emails and the origin only', () => {
    const config = resolveSiteGateConfig(
      rawEnv({
        GATE_ALWAYS_ALLOWED_EMAILS: ' Owner.Name@gmail.com, second@gmail.com ,ownername@gmail.com',
        // パス付きの値でも origin だけを使う（パスがあると basePath が無視される）
        BETTER_AUTH_URL: 'https://tt.example.com/some/path',
      })
    );
    expect(config).toEqual({
      kind: 'enabled',
      settings: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        secret: GATE_SECRET,
        fixedEmails: ['ownername@gmail.com', 'second@gmail.com'],
        baseOrigin: 'https://tt.example.com',
        isProduction: false,
      },
    });
  });

  it('falls back to NEXT_PUBLIC_APP_URL and then localhost outside production', () => {
    const fromAppUrl = resolveSiteGateConfig(
      rawEnv({ NEXT_PUBLIC_APP_URL: 'http://localhost:3100/' })
    );
    expect(fromAppUrl.kind === 'enabled' && fromAppUrl.settings.baseOrigin).toBe(
      'http://localhost:3100'
    );
    const fallback = resolveSiteGateConfig(rawEnv({ PORT: '3200' }));
    expect(fallback.kind === 'enabled' && fallback.settings.baseOrigin).toBe(
      'http://localhost:3200'
    );
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['false', 'false'],
    ['FALSE with spaces', ' FALSE '],
  ])('is disabled when the flag is %s (outside Vercel production)', (_label, value) => {
    expect(resolveSiteGateConfig(rawEnv({ GATE_GOOGLE_ENABLED: value }))).toEqual({
      kind: 'disabled',
    });
  });

  it('accepts TRUE with spaces as enabled', () => {
    expect(resolveSiteGateConfig(rawEnv({ GATE_GOOGLE_ENABLED: ' TRUE ' })).kind).toBe(
      'enabled'
    );
  });

  it('treats an invalid flag value as misconfigured', () => {
    expect(reasonOf(rawEnv({ GATE_GOOGLE_ENABLED: 'yes' }))).toContain('GATE_GOOGLE_ENABLED');
  });

  describe('本番の守り（VERCEL_ENV=production）', () => {
    it('treats an unset flag as enabled', () => {
      const config = resolveSiteGateConfig(
        rawEnv({
          GATE_GOOGLE_ENABLED: undefined,
          VERCEL_ENV: 'production',
          NODE_ENV: 'production',
          BETTER_AUTH_URL: 'https://tt.example.com',
        })
      );
      expect(config.kind).toBe('enabled');
    });

    it('is misconfigured when the flag is unset and settings are missing', () => {
      expect(
        reasonOf({ VERCEL_ENV: 'production', NODE_ENV: 'production' })
      ).toContain('GATE_GOOGLE_CLIENT_ID');
    });

    it('can be turned off only by an explicit false', () => {
      expect(
        resolveSiteGateConfig({ GATE_GOOGLE_ENABLED: 'false', VERCEL_ENV: 'production' })
      ).toEqual({ kind: 'disabled' });
    });

    it('does not apply to preview deployments', () => {
      expect(resolveSiteGateConfig({ VERCEL_ENV: 'preview' })).toEqual({ kind: 'disabled' });
    });
  });

  describe('移行の守り（Basic 認証の設定の残り）', () => {
    it.each(['true', 'TRUE', 'yes', '1'])(
      'is misconfigured when BASIC_AUTH_ENABLED=%s and the gate is not enabled',
      (basic) => {
        expect(
          reasonOf({ BASIC_AUTH_ENABLED: basic, GATE_GOOGLE_ENABLED: undefined })
        ).toContain('BASIC_AUTH_ENABLED');
        expect(
          reasonOf({ BASIC_AUTH_ENABLED: basic, GATE_GOOGLE_ENABLED: 'false' })
        ).toContain('BASIC_AUTH_ENABLED');
      }
    );

    it.each([undefined, '', 'false'])('ignores BASIC_AUTH_ENABLED=%p', (basic) => {
      expect(resolveSiteGateConfig({ BASIC_AUTH_ENABLED: basic })).toEqual({
        kind: 'disabled',
      });
    });

    it('uses the gate when both are set', () => {
      expect(resolveSiteGateConfig(rawEnv({ BASIC_AUTH_ENABLED: 'true' })).kind).toBe(
        'enabled'
      );
    });
  });

  it.each([
    ['client id', { GATE_GOOGLE_CLIENT_ID: '  ' }, 'GATE_GOOGLE_CLIENT_ID'],
    ['client secret', { GATE_GOOGLE_CLIENT_SECRET: undefined }, 'GATE_GOOGLE_CLIENT_SECRET'],
    ['short secret', { GATE_AUTH_SECRET: 'short' }, 'GATE_AUTH_SECRET'],
    ['no fixed emails', { GATE_ALWAYS_ALLOWED_EMAILS: ' , ' }, 'GATE_ALWAYS_ALLOWED_EMAILS'],
    [
      'non gmail fixed email',
      { GATE_ALWAYS_ALLOWED_EMAILS: 'ok@gmail.com,bad@example.com' },
      '2 番目',
    ],
    [
      'production without base url',
      { NODE_ENV: 'production' },
      'BETTER_AUTH_URL または NEXT_PUBLIC_APP_URL',
    ],
    ['invalid base url', { BETTER_AUTH_URL: 'not a url' }, 'URL の形ではありません'],
  ])('is misconfigured when %s', (_label, overrides, expected) => {
    expect(reasonOf(rawEnv(overrides))).toContain(expected);
  });

  it('does not put fixed email values into the reason', () => {
    const reason = reasonOf(rawEnv({ GATE_ALWAYS_ALLOWED_EMAILS: 'secret-person@example.com' }));
    expect(reason).not.toContain('secret-person');
  });

  it.each(['AUTH_SECRET', 'NEXTAUTH_SECRET', 'BETTER_AUTH_SECRET'] as const)(
    'is misconfigured when GATE_AUTH_SECRET equals %s',
    (name) => {
      expect(reasonOf(rawEnv({ [name]: ` ${GATE_SECRET} ` }))).toContain(
        'アプリ内のログインの鍵と別の値'
      );
    }
  );
});

describe('isSiteGateEnabled', () => {
  it.each([
    [{ GATE_GOOGLE_ENABLED: 'true' }, true],
    [{ GATE_GOOGLE_ENABLED: 'yes' }, true],
    [{ GATE_GOOGLE_ENABLED: 'false' }, false],
    [{}, false],
    [{ VERCEL_ENV: 'production' }, true],
    [{ GATE_GOOGLE_ENABLED: 'false', VERCEL_ENV: 'production' }, false],
    [{ BASIC_AUTH_ENABLED: 'true' }, true],
    [{ BASIC_AUTH_ENABLED: 'maybe' }, true],
    [{ BASIC_AUTH_ENABLED: 'false' }, false],
  ] as Array<[SiteGateRawEnv, boolean]>)('%j → %s', (raw, expected) => {
    expect(isSiteGateEnabled(raw)).toBe(expected);
  });
});
