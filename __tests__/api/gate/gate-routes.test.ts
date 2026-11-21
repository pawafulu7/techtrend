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
import { GET as startGET } from '@/app/api/gate/start/route';
// eslint-disable-next-line import/first
import * as catchAll from '@/app/api/gate/[...all]/route';

const ENABLED: SiteGateConfig = {
  kind: 'enabled',
  settings: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    secret: 'g'.repeat(40),
    fixedEmails: ['owner@gmail.com'],
    baseOrigin: 'http://localhost:3000',
    isProduction: false,
  },
};
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=s';
const STATE_COOKIE = 'tt-gate.oauth_state=enc; Max-Age=600; Path=/; HttpOnly; SameSite=Lax';

let ipCounter = 0;
function request(path: string, init: { method?: string; ip?: string } = {}) {
  ipCounter += 1;
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: init.method ?? 'GET',
    headers: { 'x-forwarded-for': init.ip ?? `203.0.113.${ipCounter % 250}` },
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

  it('drops error_description before showing the built-in error page', async () => {
    const response = await catchAll.GET(
      request('/api/gate/error?error=not_allowed&error_description=Call%20this%20number')
    );
    expect(response.status).toBe(200);
    const forwarded = mockHandler.mock.calls[0][0] as Request;
    const url = new URL(forwarded.url);
    expect(url.searchParams.get('error')).toBe('not_allowed');
    expect(url.searchParams.has('error_description')).toBe(false);
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
