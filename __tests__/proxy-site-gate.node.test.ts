/**
 * proxy.ts のサイトの入口（Google ログインと許可リスト）の組み込み
 *
 * 入口の判定そのもの（全状態の応答）は __tests__/lib/auth/site-gate/evaluate.test.ts、
 * 実際の Better Auth は __tests__/e2e/site-gate-auth.spec.ts で確かめる。ここでは、proxy が
 * 環境変数を読んで判定を呼び、応答にセキュリティヘッダ・キャッシュの打ち消し・Set-Cookie を正しく付けるかを見る。
 * 入口用の Better Auth と Prisma はモックする（入口の Cookie があるときだけ読まれることも確かめる）。
 */
import { NextRequest } from 'next/server';
import type { SiteGateDeps } from '@/lib/auth/site-gate/evaluate';
import type { GateAccess } from '@/lib/auth/site-gate/gate-auth-options';

const mockCreateSiteGateDeps = jest.fn();
jest.mock('@/lib/auth/site-gate/gate-session', () => ({
  createSiteGateDeps: (...args: unknown[]) => mockCreateSiteGateDeps(...args),
}));

// eslint-disable-next-line import/first
import { proxy } from '../proxy';

const GATE_ENV = {
  GATE_GOOGLE_ENABLED: 'true',
  GATE_GOOGLE_CLIENT_ID: 'client-id',
  GATE_GOOGLE_CLIENT_SECRET: 'client-secret',
  GATE_AUTH_SECRET: 'gate-secret-for-the-proxy-test-0123456789',
  GATE_ALWAYS_ALLOWED_EMAILS: 'owner@gmail.com',
};
const ENV_NAMES = [
  ...Object.keys(GATE_ENV),
  'BASIC_AUTH_ENABLED',
  'VERCEL_ENV',
  'MAINTENANCE_MODE',
];
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

const REFRESH_COOKIE = 'tt-gate.session_data=refreshed; Path=/; HttpOnly; SameSite=Lax';
const DELETE_COOKIE = 'tt-gate.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';
const GATE_COOKIE = 'tt-gate.session_token=abc; tt-gate.session_data=xyz';

function useDeps(access: GateAccess | Error = 'allowed') {
  const deps: SiteGateDeps = {
    getSession: jest.fn(async () => ({
      session: {
        email: 'friend@gmail.com',
        emailVerified: true,
        createdAt: new Date('2026-11-21T00:00:00Z'),
      },
      setCookies: [REFRESH_COOKIE],
    })),
    signOut: jest.fn(async () => [DELETE_COOKIE]),
    checkAccess: jest.fn(async () => {
      if (access instanceof Error) throw access;
      return access;
    }),
  };
  mockCreateSiteGateDeps.mockReturnValue(deps);
  return deps;
}

function request(
  path: string,
  init: { method?: string; mode?: string; cookie?: string; headers?: Record<string, string> } = {}
): NextRequest {
  const headers: Record<string, string> = { ...init.headers };
  headers['sec-fetch-mode'] = init.mode ?? 'navigate';
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: init.method ?? 'GET',
    headers,
  });
}

function setCookiesOf(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function setEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

beforeEach(() => {
  mockCreateSiteGateDeps.mockReset();
  setEnv({ BASIC_AUTH_ENABLED: undefined, VERCEL_ENV: undefined, MAINTENANCE_MODE: undefined });
  setEnv(GATE_ENV);
});

afterEach(() => {
  setEnv(originalEnv);
});

describe('proxy のサイトの入口', () => {
  describe('入口の Cookie が無いとき', () => {
    it('redirects a page navigation to the start, with security headers', async () => {
      const response = await proxy(request('/digest?period=week'));

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/api/gate/start');
      expect(location.searchParams.get('callbackURL')).toBe('/digest?period=week');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(mockCreateSiteGateDeps).not.toHaveBeenCalled();
    });

    it('returns 401 JSON to API requests before the CSRF check', async () => {
      const response = await proxy(request('/api/comments', { method: 'POST', mode: 'cors' }));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: 'GATE_SESSION_REQUIRED' });
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('rejects requests with NUL before reaching the NUL check (gate first)', async () => {
      const response = await proxy(
        request('/api/articles?search=a%00b', { mode: 'cors' })
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for the image optimizer', async () => {
      const response = await proxy(request('/_next/image?url=x&w=64&q=75', { mode: 'no-cors' }));
      expect(response.status).toBe(401);
    });

    it.each(['/api/gate/start', '/api/gate/callback/google', '/api/gate/error'])(
      'lets %s through with no-store',
      async (path) => {
        const response = await proxy(request(path));

        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(setCookiesOf(response)).toEqual([]);
        expect(mockCreateSiteGateDeps).not.toHaveBeenCalled();
      }
    );
  });

  it('lets the app sign-out through without a gate session', async () => {
    const response = await proxy(
      request('/api/auth/sign-out', { method: 'POST', mode: 'cors', headers: { origin: 'http://localhost:3000' } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mockCreateSiteGateDeps).not.toHaveBeenCalled();
  });

  describe('入口の Cookie があるとき', () => {
    it('passes an allowed session with cache busting, Vary and the refreshed cookie', async () => {
      useDeps('allowed');
      const response = await proxy(request('/', { cookie: GATE_COOKIE }));

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vary')).toContain('Cookie');
      expect(setCookiesOf(response)).toEqual([REFRESH_COOKIE]);
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(mockCreateSiteGateDeps).toHaveBeenCalledWith(
        expect.objectContaining({ fixedEmails: ['owner@gmail.com'] })
      );
    });

    it('does not bust the cache or forward cookies for the image optimizer', async () => {
      useDeps('allowed');
      const response = await proxy(
        request('/_next/image?url=x&w=64&q=75', { cookie: GATE_COOKIE, mode: 'no-cors' })
      );

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toBeNull();
      expect(setCookiesOf(response)).toEqual([]);
    });

    it('keeps the gate cookie and cache busting on the login redirect of protected pages', async () => {
      useDeps('allowed');
      const response = await proxy(request('/profile', { cookie: GATE_COOKIE }));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/login');
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(setCookiesOf(response)).toEqual([REFRESH_COOKIE]);
    });

    it('keeps the gate cookie and cache busting on the maintenance page', async () => {
      useDeps('allowed');
      process.env.MAINTENANCE_MODE = 'true';
      const response = await proxy(request('/', { cookie: GATE_COOKIE }));

      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(setCookiesOf(response)).toEqual([REFRESH_COOKIE]);
    });

    it('returns 403 to the API and clears the gate cookie after the account was removed', async () => {
      useDeps('not_allowed');
      const response = await proxy(request('/api/stats', { cookie: GATE_COOKIE, mode: 'cors' }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: 'GATE_NOT_ALLOWED' });
      expect(setCookiesOf(response)).toEqual([DELETE_COOKIE]);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('returns 503 when the allowlist cannot be checked', async () => {
      useDeps(new Error('db down'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const response = await proxy(request('/', { cookie: GATE_COOKIE }));

      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      // 例外の message（接続先が入りうる）はログに出さない
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('db down');
      errorSpy.mockRestore();
    });
  });

  describe('設定', () => {
    it('does nothing when the gate is disabled', async () => {
      setEnv({ GATE_GOOGLE_ENABLED: undefined });
      const response = await proxy(request('/'));

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it.each([
      ['a required setting is missing', { GATE_GOOGLE_CLIENT_SECRET: undefined }],
      ['the flag is invalid', { GATE_GOOGLE_ENABLED: 'yes' }],
      // 移行の守り: Basic 認証の設定だけが残った環境を全公開にしない
      ['Basic auth is still set and the gate is off', { GATE_GOOGLE_ENABLED: 'false', BASIC_AUTH_ENABLED: 'true' }],
      // 本番の守り: Vercel の Production では未設定も有効とみなす
      ['the flag is unset in Vercel production without settings', {
        GATE_GOOGLE_ENABLED: undefined,
        GATE_GOOGLE_CLIENT_ID: undefined,
        VERCEL_ENV: 'production',
      }],
    ])('returns 503 for every request when %s', async (_label, values) => {
      setEnv(values);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      for (const path of ['/', '/api/stats', '/api/gate/start']) {
        const response = await proxy(request(path));
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
      }
      errorSpy.mockRestore();
    });
  });
});
