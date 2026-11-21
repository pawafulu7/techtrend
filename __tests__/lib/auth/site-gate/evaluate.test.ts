import { NextRequest } from 'next/server';
import type {
  SiteGateConfig,
  SiteGateSettings,
} from '@/lib/auth/site-gate/config';
import {
  evaluateSiteGate,
  isBrowserNavigation,
  type GateSessionInfo,
  type SiteGateDeps,
} from '@/lib/auth/site-gate/evaluate';
import type { GateAccess } from '@/lib/auth/site-gate/gate-auth-options';

const SETTINGS: SiteGateSettings = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  secret: 'g'.repeat(40),
  fixedEmails: ['owner@gmail.com'],
  baseOrigin: 'http://localhost:3000',
  isProduction: false,
};
const ENABLED: SiteGateConfig = { kind: 'enabled', settings: SETTINGS };

const SESSION: GateSessionInfo = {
  email: 'friend@gmail.com',
  emailVerified: true,
  createdAt: new Date('2026-11-21T00:00:00Z'),
};
const REFRESH_COOKIE = 'tt-gate.session_data=refreshed; Path=/; HttpOnly';
const DELETE_COOKIES = [
  'tt-gate.session_token=; Max-Age=0; Path=/',
  'tt-gate.session_data=; Max-Age=0; Path=/',
];
const GET_SESSION_DELETE = 'tt-gate.oauth_state=; Max-Age=0; Path=/';

function deps(
  options: {
    session?: GateSessionInfo | null;
    sessionCookies?: string[];
    access?: GateAccess;
    getSessionError?: Error;
    accessError?: Error;
  } = {}
) {
  const getSession = jest.fn(async () => {
    if (options.getSessionError) throw options.getSessionError;
    return {
      session: options.session === undefined ? SESSION : options.session,
      setCookies: options.sessionCookies ?? [REFRESH_COOKIE],
    };
  });
  const signOut = jest.fn(async () => DELETE_COOKIES);
  const checkAccess = jest.fn(async () => {
    if (options.accessError) throw options.accessError;
    return options.access ?? 'allowed';
  });
  const value: SiteGateDeps = { getSession, signOut, checkAccess };
  const loadDeps = jest.fn(async () => value);
  return { loadDeps, getSession, signOut, checkAccess };
}

function request(
  path: string,
  init: {
    method?: string;
    mode?: string | null;
    accept?: string;
    cookie?: string | null;
  } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  const mode = init.mode === undefined ? 'navigate' : init.mode;
  if (mode !== null) headers['sec-fetch-mode'] = mode;
  if (init.accept) headers.accept = init.accept;
  const cookie =
    init.cookie === undefined ? 'tt-gate.session_token=abc' : init.cookie;
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: init.method ?? 'GET',
    headers,
  });
}

function setCookiesOf(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[\w.-]+=)/).map((v) => v.trim()) : [];
}

async function deny(outcomePromise: ReturnType<typeof evaluateSiteGate>) {
  const outcome = await outcomePromise;
  if (outcome.kind !== 'deny')
    throw new Error(`expected deny, got ${outcome.kind}`);
  return outcome.response;
}

describe('evaluateSiteGate', () => {
  it('does nothing when the gate is disabled', async () => {
    const d = deps();
    await expect(
      evaluateSiteGate(request('/'), { kind: 'disabled' }, d.loadDeps)
    ).resolves.toEqual({ kind: 'disabled' });
    expect(d.loadDeps).not.toHaveBeenCalled();
  });

  it('passes the misconfiguration through', async () => {
    const d = deps();
    await expect(
      evaluateSiteGate(
        request('/'),
        { kind: 'misconfigured', reason: 'x' },
        d.loadDeps
      )
    ).resolves.toEqual({ kind: 'misconfigured', reason: 'x' });
  });

  it.each(['/api/gate/start', '/api/gate/callback/google', '/api/gate/error'])(
    'lets GET %s through without a gate session',
    async (path) => {
      const d = deps();
      await expect(
        evaluateSiteGate(request(path, { cookie: null }), ENABLED, d.loadDeps)
      ).resolves.toEqual({ kind: 'public' });
      expect(d.loadDeps).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['POST to the callback', '/api/gate/callback/google', 'POST'],
    ['another gate path', '/api/gate/update-user', 'GET'],
    ['an encoded callback', '/api/gate/callback/%67oogle', 'GET'],
  ])('does not treat %s as public', async (_label, path, method) => {
    const d = deps();
    const response = await deny(
      evaluateSiteGate(
        request(path, { cookie: null, method, mode: 'cors' }),
        ENABLED,
        d.loadDeps
      )
    );
    expect(response.status).toBe(401);
  });

  describe('入口の Cookie が無いとき', () => {
    it('redirects a page navigation to the start with the original path and query', async () => {
      const d = deps();
      const response = await deny(
        evaluateSiteGate(
          request('/digest?x=1&y=%E3%81%82', { cookie: null }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/api/gate/start');
      expect(location.searchParams.get('callbackURL')).toBe(
        '/digest?x=1&y=%E3%81%82'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(d.loadDeps).not.toHaveBeenCalled();
    });

    it('builds the redirect from the configured base URL, not from the request host', async () => {
      const d = deps();
      const outcome = await evaluateSiteGate(
        new NextRequest(new URL('http://127.0.0.1:3000/digest'), {
          headers: { 'sec-fetch-mode': 'navigate' },
        }),
        ENABLED,
        d.loadDeps
      );
      if (outcome.kind !== 'deny') throw new Error(outcome.kind);
      expect(outcome.response.headers.get('location')).toBe(
        'http://localhost:3000/api/gate/start?callbackURL=%2Fdigest'
      );
    });

    it('returns 401 JSON with a code for API requests', async () => {
      const d = deps();
      const response = await deny(
        evaluateSiteGate(
          request('/api/stats', { cookie: null, mode: 'cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        success: false,
        error: 'Site sign-in required',
        code: 'GATE_SESSION_REQUIRED',
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('returns 401 for in-app navigation fetches and prefetches of pages', async () => {
      const d = deps();
      const response = await deny(
        evaluateSiteGate(
          request('/trends', { cookie: null, mode: 'cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for the image optimizer (no-cors)', async () => {
      const d = deps();
      const response = await deny(
        evaluateSiteGate(
          request('/_next/image?url=x', { cookie: null, mode: 'no-cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(401);
    });
  });

  describe('入口の Cookie があるとき', () => {
    it('passes an allowed session and forwards the refreshed cookies', async () => {
      const d = deps();
      await expect(
        evaluateSiteGate(request('/'), ENABLED, d.loadDeps)
      ).resolves.toEqual({
        kind: 'pass',
        setCookies: [REFRESH_COOKIE],
      });
      expect(d.checkAccess).toHaveBeenCalledWith(
        'friend@gmail.com',
        SESSION.createdAt
      );
    });

    it('accepts the production cookie name', async () => {
      const d = deps();
      const outcome = await evaluateSiteGate(
        request('/', { cookie: '__Secure-tt-gate.session_token=abc' }),
        ENABLED,
        d.loadDeps
      );
      expect(outcome.kind).toBe('pass');
    });

    it('ignores the app sign-in cookie', async () => {
      const d = deps();
      const response = await deny(
        evaluateSiteGate(
          request('/', { cookie: 'better-auth.session_token=abc' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(302);
      expect(d.loadDeps).not.toHaveBeenCalled();
    });

    it('redirects an invalid or expired session without forwarding its cookie deletions', async () => {
      const d = deps({ session: null, sessionCookies: [GET_SESSION_DELETE] });
      const response = await deny(
        evaluateSiteGate(request('/'), ENABLED, d.loadDeps)
      );
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get('location')!).pathname).toBe(
        '/api/gate/start'
      );
      // oauth_state の削除を載せると、別のタブで進行中のログインが壊れる
      expect(setCookiesOf(response)).toEqual([]);
    });

    it('returns 401 for an invalid session on the API', async () => {
      const d = deps({ session: null, sessionCookies: [GET_SESSION_DELETE] });
      const response = await deny(
        evaluateSiteGate(
          request('/api/stats', { mode: 'cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(401);
      expect(setCookiesOf(response)).toEqual([]);
    });

    it('treats a session older than a re-added row as signed out', async () => {
      const d = deps({ access: 'stale_session' });
      const response = await deny(
        evaluateSiteGate(request('/'), ENABLED, d.loadDeps)
      );
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get('location')!).pathname).toBe(
        '/api/gate/start'
      );
      expect(d.signOut).not.toHaveBeenCalled();
    });

    it('redirects a revoked account to the error page and clears the gate cookies', async () => {
      const d = deps({ access: 'not_allowed' });
      const response = await deny(
        evaluateSiteGate(request('/digest'), ENABLED, d.loadDeps)
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/api/gate/error');
      expect(location.searchParams.get('error')).toBe('not_allowed');
      expect(setCookiesOf(response)).toEqual(DELETE_COOKIES);
      expect(setCookiesOf(response)).not.toContain(REFRESH_COOKIE);
    });

    it('returns 403 JSON for a revoked account on the API and clears the gate cookies', async () => {
      const d = deps({ access: 'not_allowed' });
      const response = await deny(
        evaluateSiteGate(
          request('/api/stats', { mode: 'cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'GATE_NOT_ALLOWED' });
      expect(setCookiesOf(response)).toEqual(DELETE_COOKIES);
    });

    it.each([
      ['an unverified email', { ...SESSION, emailVerified: false }],
      ['a non-Gmail email', { ...SESSION, email: 'friend@example.com' }],
    ])(
      'rejects a session with %s without checking the allowlist',
      async (_label, session) => {
        const d = deps({ session });
        const response = await deny(
          evaluateSiteGate(request('/'), ENABLED, d.loadDeps)
        );
        expect(new URL(response.headers.get('location')!).pathname).toBe(
          '/api/gate/error'
        );
        expect(d.checkAccess).not.toHaveBeenCalled();
      }
    );

    it('still rejects when clearing the cookies fails', async () => {
      const d = deps({ access: 'not_allowed' });
      d.signOut.mockRejectedValue(new Error('boom'));
      const response = await deny(
        evaluateSiteGate(
          request('/api/stats', { mode: 'cors' }),
          ENABLED,
          d.loadDeps
        )
      );
      expect(response.status).toBe(403);
    });

    it.each([
      ['the session check', { getSessionError: new Error('boom') }],
      ['the allowlist check', { accessError: new Error('db down') }],
    ])('reports unavailable when %s throws', async (_label, options) => {
      const d = deps(options);
      const outcome = await evaluateSiteGate(request('/'), ENABLED, d.loadDeps);
      expect(outcome.kind).toBe('unavailable');
    });

    it('reports unavailable when loading the dependencies fails', async () => {
      const outcome = await evaluateSiteGate(
        request('/'),
        ENABLED,
        async () => {
          throw new Error('import failed');
        }
      );
      expect(outcome.kind).toBe('unavailable');
    });
  });
});

describe('isBrowserNavigation', () => {
  it.each([
    ['page navigate', '/trends', { mode: 'navigate' }, true],
    [
      'api navigate',
      '/api/auth/verify-email?token=x',
      { mode: 'navigate' },
      true,
    ],
    ['HEAD navigate', '/trends', { mode: 'navigate', method: 'HEAD' }, true],
    ['page cors (in-app fetch)', '/trends', { mode: 'cors' }, false],
    ['page no-cors', '/trends', { mode: 'no-cors' }, false],
    ['page without Sec-Fetch-Mode', '/trends', { mode: null }, true],
    ['api without Sec-Fetch-Mode', '/api/stats', { mode: null }, false],
    [
      'api without Sec-Fetch-Mode accepting html',
      '/api/auth/verify-email',
      { mode: null, accept: 'text/html,application/xhtml+xml' },
      true,
    ],
    ['POST navigate', '/trends', { mode: 'navigate', method: 'POST' }, false],
  ] as const)('%s → %s', (_label, path, init, expected) => {
    expect(isBrowserNavigation(request(path, init))).toBe(expected);
  });
});
