/**
 * 入口のログインの開始・戻り・エラーの Route Handler
 *
 * better-auth は ESM だけで Jest では読み込めないので、入口用のインスタンス（gate-auth）はモックする。
 * 実際の Better Auth での開始→戻り→確認は __tests__/e2e/site-gate-auth.spec.ts で確かめる。
 */
import { NextRequest } from 'next/server';
import type { SiteGateConfig } from '@/lib/auth/site-gate/config';
import { resolveGateCallbackPath } from '@/lib/auth/site-gate/callback-path';

const mockGetSiteGateConfig = jest.fn<SiteGateConfig, []>();
jest.mock('@/lib/auth/site-gate/server-config', () => ({
  getSiteGateConfig: () => mockGetSiteGateConfig(),
}));

const mockSignInSocial = jest.fn();
const mockHandler = jest.fn();
jest.mock('@/lib/auth/site-gate/gate-auth', () => ({
  getGateAuth: () => ({
    api: { signInSocial: mockSignInSocial },
    handler: mockHandler,
  }),
}));

// eslint-disable-next-line import/first
import { prisma } from '@/lib/prisma';
// eslint-disable-next-line import/first
import { noteRejectedGateAccount } from '@/lib/auth/site-gate/rejected-account-context';
// eslint-disable-next-line import/first
import {
  buildGateRequestAccountCookie,
  readGateRequestAccount,
} from '@/lib/auth/site-gate/request-account-cookie';
// eslint-disable-next-line import/first
import { GET as startGET } from '@/app/api/gate/start/route';
// eslint-disable-next-line import/first
import * as catchAll from '@/app/api/gate/[...all]/route';

const ENABLED_SECRET = 'g'.repeat(40);
const ENABLED: SiteGateConfig = {
  kind: 'enabled',
  settings: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    secret: ENABLED_SECRET,
    fixedEmails: ['owner@gmail.com'],
    baseOrigin: 'http://localhost:3000',
    isProduction: false,
  },
};
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=s';
const STATE_COOKIE = 'tt-gate.oauth_state=enc; Max-Age=600; Path=/; HttpOnly; SameSite=Lax';

let ipCounter = 0;
const NOTICE = 'tt-gate.error_notice=1';

const prismaMock = prisma as any;

/** 未登録と拒否されたアカウントの、利用の申請用の Cookie（名前=値） */
function requestAccountCookie(email: string, secret = ENABLED_SECRET): string {
  return buildGateRequestAccountCookie({ email, secret, isProduction: false })!.split(';')[0];
}

function request(
  path: string,
  init: { method?: string; ip?: string; cookie?: string } = {}
) {
  ipCounter += 1;
  const headers: Record<string, string> = {
    'x-forwarded-for': init.ip ?? `203.0.113.${ipCounter % 250}`,
  };
  // 拒否のページは、ログインが拒否・失敗した直後の目印があるときだけ出す。既定ではあるものとして呼ぶ
  const cookie = init.cookie ?? (path.startsWith('/api/gate/error') ? NOTICE : undefined);
  if (cookie) headers.cookie = cookie;
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

beforeEach(() => {
  mockGetSiteGateConfig.mockReturnValue(ENABLED);
  mockSignInSocial.mockReset();
  mockSignInSocial.mockResolvedValue({
    headers: new Headers([['set-cookie', STATE_COOKIE]]),
    response: { url: GOOGLE_URL, redirect: true },
  });
  prismaMock.gateAccessRequest.findUnique.mockReset();
  prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
  mockHandler.mockReset();
  mockHandler.mockResolvedValue(
    new Response('<html>error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  );
});

describe('GET /api/gate/start', () => {
  it('redirects to Google with the state cookie and no-store', async () => {
    const response = await startGET(request('/api/gate/start?callbackURL=%2Fdigest%3Fx%3D1'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(GOOGLE_URL);
    expect(setCookiesOf(response).join('\n')).toContain('tt-gate.oauth_state=enc');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { provider: 'google', callbackURL: '/digest?x=1' },
        returnHeaders: true,
      })
    );
  });

  it.each([
    ['disabled', { kind: 'disabled' } as SiteGateConfig],
    ['misconfigured', { kind: 'misconfigured', reason: 'x' } as SiteGateConfig],
  ])('is 404 when the gate is %s', async (_label, config) => {
    mockGetSiteGateConfig.mockReturnValue(config);
    const response = await startGET(request('/api/gate/start'));
    expect(response.status).toBe(404);
    expect(mockSignInSocial).not.toHaveBeenCalled();
  });

  it('restarts on the canonical host when the Host header differs from the URL', async () => {
    // 開発サーバーは 127.0.0.1 で開いても request.url を localhost にするので、見出しで見分ける
    const response = await startGET(
      new NextRequest(new URL('http://localhost:3000/api/gate/start?callbackURL=%2Fx'), {
        headers: { host: '127.0.0.1:3000' },
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/api/gate/start?callbackURL=%2Fx'
    );
    expect(mockSignInSocial).not.toHaveBeenCalled();
  });

  it('uses the first x-forwarded-host (set by Vercel) over the Host header', async () => {
    const response = await startGET(
      new NextRequest(new URL('http://localhost:3000/api/gate/start'), {
        headers: { host: 'localhost:3000', 'x-forwarded-host': 'alias.example.com, localhost:3000' },
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost:3000/api/gate/start');
  });

  it('starts sign-in when the Host header is the canonical host', async () => {
    const response = await startGET(
      new NextRequest(new URL('http://localhost:3000/api/gate/start'), {
        headers: { host: 'localhost:3000' },
      })
    );
    expect(response.headers.get('location')).toBe(GOOGLE_URL);
  });

  it('restarts on the canonical host when opened on another host', async () => {
    const response = await startGET(
      new NextRequest(new URL('http://127.0.0.1:3000/api/gate/start?callbackURL=%2Fx'))
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/api/gate/start?callbackURL=%2Fx'
    );
    expect(mockSignInSocial).not.toHaveBeenCalled();
  });

  it('returns 503 when Better Auth fails, without leaking the error', async () => {
    mockSignInSocial.mockRejectedValue(new Error('internal detail'));
    const response = await startGET(request('/api/gate/start'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('internal detail');
  });

  it('limits starts to 30 per minute per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const response = await startGET(request('/api/gate/start', { ip: '198.51.100.7' }));
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 302)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});

describe('resolveGateCallbackPath', () => {
  it.each([
    [null, '/'],
    ['', '/'],
    ['/digest?x=1', '/digest?x=1'],
    // 確認メールのリンクなどは入口のログインを挟んでもそのまま戻す（sanitizeCallbackUrl は使わない）
    ['/auth/verify?token=abc', '/auth/verify?token=abc'],
    ['https://evil.example.com/', '/'],
    ['//evil.example.com/', '/'],
    ['/\\evil.example', '/'],
    ['/api/gate/start?callbackURL=/x', '/'],
    ['/api/gate', '/'],
    // 入口自身かはパスだけで見る
    ['/api/gate?x=1', '/'],
    ['/api/gate#section', '/'],
    ['/api/gate/start?x=1#y', '/'],
    ['/digest?x=1#y', '/digest?x=1#y'],
    ['/api/gateway', '/api/gateway'],
    [`/${'a'.repeat(1023)}`, `/${'a'.repeat(1023)}`],
    [`/${'a'.repeat(1024)}`, '/'],
  ])('%p → %p', (raw, expected) => {
    expect(resolveGateCallbackPath(raw)).toBe(expected);
  });
});

describe('GET /api/gate/[...all]', () => {
  it('exports GET only (POST and others are 405 by Next)', () => {
    expect(Object.keys(catchAll).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['GET']);
  });

  it('forwards the Google callback and adds no-store', async () => {
    mockHandler.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: [
          ['location', '/digest'],
          ['set-cookie', 'tt-gate.session_token=t; Path=/'],
        ],
      })
    );
    const response = await catchAll.GET(request('/api/gate/callback/google?code=c&state=s'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/digest');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(setCookiesOf(response).join('\n')).toContain('tt-gate.session_token=t');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not_allowed', 'not_allowed', 403],
    ['state_mismatch', 'state_mismatch', 400],
    ['access_denied', 'access_denied', 400],
    ['temporarily_unavailable', 'temporarily_unavailable', 503],
    ['Your_access_was_revoked_call_xxx', 'unknown', 400],
    ['', 'unknown', 400],
  ] as const)(
    'returns its own error page without Better Auth, showing only known codes (%p -> %p)',
    async (raw, shown, status) => {
      const response = await catchAll.GET(
        request(`/api/gate/error?error=${encodeURIComponent(raw)}`)
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-store');
      const html = await response.text();
      expect(html).toContain(`エラーのコード: ${shown}`);
      if (raw) expect(html.includes(raw)).toBe(raw === shown);
      expect(mockHandler).not.toHaveBeenCalled();
    }
  );

  it('limits callbacks to 30 per minute per IP (state cookies can be replayed for 10 minutes)', async () => {
    mockHandler.mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/' } }));
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const response = await catchAll.GET(
        request('/api/gate/callback/google?code=c&state=s', { ip: '198.51.100.9' })
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 302)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(mockHandler).toHaveBeenCalledTimes(30);
  });

  it('limits the error page to 30 per minute per IP (it reads the DB for the access request)', async () => {
    const cookie = `${NOTICE}; ${requestAccountCookie('friend@gmail.com')}`;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const response = await catchAll.GET(
        request('/api/gate/error?error=not_allowed', { ip: '198.51.100.10', cookie })
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 403)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(prismaMock.gateAccessRequest.findUnique).toHaveBeenCalledTimes(30);
  });

  it.each([
    ['the start', '/api/gate/start?callbackURL=%2F', undefined, '198.51.100.21'],
    ['the callback', '/api/gate/callback/google?code=c&state=s', undefined, '198.51.100.22'],
    ['the error page', '/api/gate/error?error=not_allowed', NOTICE, '198.51.100.23'],
  ])('answers with a page, not JSON, when %s is rate limited (it is opened by navigation)', async (_label, path, cookie, ip) => {
    mockHandler.mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/' } }));
    const open = () =>
      path.startsWith('/api/gate/start')
        ? startGET(request(path, { ip, cookie }))
        : catchAll.GET(request(path, { ip, cookie }));
    let last = await open();
    for (let i = 0; i < 30; i++) last = await open();
    expect(last.status).toBe(429);
    expect(last.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(last.headers.get('cache-control')).toBe('no-store');
    expect(last.headers.get('retry-after')).toBeTruthy();
    const html = await last.text();
    expect(html).toContain('<h1>しばらくお待ちください</h1>');
    expect(html).not.toContain('rate_limited');
  });

  it('does not show the error page when opened directly (no notice cookie) and starts sign-in instead', async () => {
    const response = await catchAll.GET(
      request('/api/gate/error?error=not_allowed', { cookie: 'other=1' })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/api/gate/start?callbackURL=%2F'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('adds the notice cookie only when Better Auth redirects to the error page', async () => {
    mockHandler.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://localhost:3000/api/gate/error?error=not_allowed' },
      })
    );
    const denied = await catchAll.GET(request('/api/gate/callback/google?code=c&state=s'));
    const notice = setCookiesOf(denied).join('\n');
    expect(notice).toContain('tt-gate.error_notice=1');
    expect(notice).toContain('Path=/api/gate/error');
    expect(notice).toContain('Max-Age=60');
    expect(notice).toContain('HttpOnly');

    mockHandler.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: '/digest' } })
    );
    const allowed = await catchAll.GET(request('/api/gate/callback/google?code=c&state=s'));
    expect(setCookiesOf(allowed).join('\n')).not.toContain('error_notice');
  });

  describe('利用の申請（未登録で拒否されたアカウント）', () => {
    const ERROR_LOCATION = 'http://localhost:3000/api/gate/error?error=not_allowed';
    const requestCookieOf = (response: Response) =>
      setCookiesOf(response).find((c) => c.startsWith('tt-gate.request_account='));

    it('hands the rejected account to the error page in a signed cookie', async () => {
      // ログイン時の確認（gate-auth.ts の onNotListed）が、戻りの処理のなかで拒否したアカウントを控える
      mockHandler.mockImplementationOnce(async () => {
        await Promise.resolve();
        noteRejectedGateAccount('Taro.Suzuki@gmail.com');
        return new Response(null, { status: 302, headers: { location: ERROR_LOCATION } });
      });
      const response = await catchAll.GET(request('/api/gate/callback/google?code=c&state=s'));
      const cookie = requestCookieOf(response)!;
      expect(cookie).toContain('Path=/api/gate;');
      expect(cookie).toContain('Max-Age=1800');
      expect(cookie).toContain('HttpOnly');
      const value = cookie.split(';')[0].slice('tt-gate.request_account='.length);
      expect(readGateRequestAccount(value, ENABLED_SECRET)).toBe('taro.suzuki@gmail.com');
      expect(value).not.toContain('@');
    });

    it.each([
      ['a successful sign-in', '/digest'],
      ['a cancelled sign-in', 'http://localhost:3000/api/gate/error?error=access_denied'],
      ['a rejection without a known account', ERROR_LOCATION],
    ])('clears the cookie after %s (no request for a previously rejected account)', async (_label, location) => {
      mockHandler.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location } })
      );
      const response = await catchAll.GET(request('/api/gate/callback/google?code=c&state=s'));
      expect(requestCookieOf(response)).toBe(
        'tt-gate.request_account=; Path=/api/gate; Max-Age=0; HttpOnly; SameSite=Lax'
      );
    });

    it('does not mix accounts between concurrent callbacks', async () => {
      mockHandler.mockImplementation(async (req: Request) => {
        const who = new URL(req.url).searchParams.get('code')!;
        await new Promise((resolve) => setTimeout(resolve, who === 'first' ? 10 : 1));
        if (who !== 'none') noteRejectedGateAccount(`${who}@gmail.com`);
        return new Response(null, { status: 302, headers: { location: ERROR_LOCATION } });
      });
      const responses = await Promise.all(
        ['first', 'second', 'none'].map((code) =>
          catchAll.GET(request(`/api/gate/callback/google?code=${code}&state=s`))
        )
      );
      const accounts = responses.map((response) => {
        const value = requestCookieOf(response)!.split(';')[0].slice('tt-gate.request_account='.length);
        return readGateRequestAccount(value, ENABLED_SECRET);
      });
      expect(accounts).toEqual(['first@gmail.com', 'second@gmail.com', null]);
    });

    it('shows the request form for the account in the cookie', async () => {
      const response = await catchAll.GET(
        request('/api/gate/error?error=not_allowed', {
          cookie: `${NOTICE}; ${requestAccountCookie('taro.suzuki@gmail.com')}`,
        })
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain('action="/api/gate/request"');
      // アドレスの欄には、拒否されたアカウントを入れておく（書き換えられる）
      expect(html).toContain('name="account" type="email"');
      expect(html).toContain('value="taro.suzuki@gmail.com"');
      // 申請の有無は、正規化したアドレスで引く
      expect(prismaMock.gateAccessRequest.findUnique).toHaveBeenCalledWith({
        where: { email: 'tarosuzuki@gmail.com' },
        select: { id: true },
      });
    });

    it('shows that the request is pending instead of the form', async () => {
      prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ id: 'r1' });
      const response = await catchAll.GET(
        request('/api/gate/error?error=not_allowed', {
          cookie: `${NOTICE}; ${requestAccountCookie('friend@gmail.com')}`,
        })
      );
      const html = await response.text();
      expect(html).toContain('<h1>まだログインできません</h1>');
      expect(html).not.toContain('<form');
    });

    it('still shows the form when the pending check fails', async () => {
      prismaMock.gateAccessRequest.findUnique.mockRejectedValue(new Error('db down at 10.0.0.1'));
      const response = await catchAll.GET(
        request('/api/gate/error?error=not_allowed', {
          cookie: `${NOTICE}; ${requestAccountCookie('friend@gmail.com')}`,
        })
      );
      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain('<form');
      expect(html).not.toContain('10.0.0.1');
    });

    it.each([
      ['no cookie', NOTICE],
      ['a cookie signed with another secret', `${NOTICE}; ${requestAccountCookie('friend@gmail.com', 'x'.repeat(40))}`],
      ['a forged value', `${NOTICE}; tt-gate.request_account=9999999999.ZnJpZW5kQGdtYWlsLmNvbQ.AAAA`],
    ])('shows no form with %s', async (_label, cookie) => {
      const response = await catchAll.GET(
        request('/api/gate/error?error=not_allowed', { cookie })
      );
      const html = await response.text();
      expect(html).not.toContain('<form');
      expect(html).toContain('追加は、管理者に頼んでください。');
      expect(prismaMock.gateAccessRequest.findUnique).not.toHaveBeenCalled();
    });

    it('does not offer the request for other errors, even with the cookie', async () => {
      const response = await catchAll.GET(
        request('/api/gate/error?error=access_denied', {
          cookie: `${NOTICE}; ${requestAccountCookie('friend@gmail.com')}`,
        })
      );
      const html = await response.text();
      expect(html).not.toContain('<form');
      expect(html).not.toContain('friend@gmail.com');
      expect(prismaMock.gateAccessRequest.findUnique).not.toHaveBeenCalled();
    });
  });

  it('ignores error_description (does not show text from the URL)', async () => {
    const response = await catchAll.GET(
      request('/api/gate/error?error=not_allowed&error_description=Call%20this%20number')
    );
    expect(await response.text()).not.toContain('Call this number');
  });

  it.each([
    '/api/gate/update-user',
    '/api/gate/get-session',
    '/api/gate/reset-password/abc',
    '/api/gate/callback/%67oogle',
    '/api/gate//callback/google',
    '/api/gate/callback/github',
    '/api/gate/callback/google/extra',
    '/api/gate/sign-in/social',
    '/api/gate/ok',
  ])('is 404 for %s', async (path) => {
    const response = await catchAll.GET(request(path));
    expect(response.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('is 404 for HEAD', async () => {
    const response = await catchAll.GET(request('/api/gate/error', { method: 'HEAD' }));
    expect(response.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('is 404 when the gate is disabled', async () => {
    mockGetSiteGateConfig.mockReturnValue({ kind: 'disabled' });
    const response = await catchAll.GET(request('/api/gate/callback/google'));
    expect(response.status).toBe(404);
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
