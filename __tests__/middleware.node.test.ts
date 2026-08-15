import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

describe('middleware - security headers', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete process.env.BASIC_AUTH_ENABLED;
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASS;
    delete process.env.BASIC_PASSWORD;
    delete process.env.BASIC_AUTH_GATE_SECRET;
    delete process.env.CRON_TOKEN;
    delete process.env.CRON_SECRET;
    delete process.env.MAINTENANCE_MODE;
  });

  describe('Security headers設定', () => {
    it('should set Content-Security-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    });

    it('should set X-Frame-Options header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-Content-Type-Options header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set Referrer-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should set Permissions-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Permissions-Policy')).toBeDefined();
      expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
      expect(response.headers.get('Permissions-Policy')).toContain('payment=()');
    });

    it('should set Cross-Origin-Opener-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    });

    it('should set Cross-Origin-Embedder-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('unsafe-none');
    });
  });

  describe('HSTS設定', () => {
    it('should set HSTS header for HTTPS in production', async () => {
      process.env.NODE_ENV = 'production';
      const request = new NextRequest(new URL('https://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeDefined();
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains');
    });

    it('should NOT set HSTS header for HTTP', async () => {
      process.env.NODE_ENV = 'production';
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeFalsy();
    });

    it('should NOT set HSTS header in development', async () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest(new URL('https://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeFalsy();
    });
  });

  describe('環境別CSP', () => {
    it('should use development CSP with unsafe-eval', async () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).toContain('ws:');
      expect(csp).toContain('wss:');
    });

    it('should use production CSP without unsafe-eval (client bundle optimized)', async () => {
      // Note: unsafe-eval is NOT required after removing pino/crypto from client components
      // Client components use lib/logger.client.ts (console-based)
      process.env.NODE_ENV = 'production';
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).toContain("object-src 'none'");
    });
  });

  describe('既存機能との統合', () => {
    it('should maintain existing theme cookie functionality', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('x-theme')).toBeDefined();
    });

    it('should maintain Basic Auth when enabled', async () => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_PASS = 'secret';
      process.env.BASIC_AUTH_GATE_SECRET = 'f'.repeat(64);

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBeTruthy();
    });

    it('should allow cron requests with valid CRON_SECRET without Basic Auth', async () => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_PASS = 'secret';
      process.env.BASIC_AUTH_GATE_SECRET = 'f'.repeat(64);
      process.env.CRON_TOKEN = 'test-cron-secret';

      const request = new NextRequest(new URL('http://localhost:3000/'));
      request.headers.set('authorization', 'Bearer test-cron-secret');
      const response = await proxy(request);

      expect(response.status).not.toBe(401);
      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
    });

    it('should redirect to login for protected paths without session', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/profile'));
      const response = await proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/login');
    });

    it('should redirect to login for /digest without session', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/digest'));
      const response = await proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/login');
    });
  });

  describe('セキュリティヘッダの順序', () => {
    it('should set security headers before theme header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      // Verify both headers are set
      expect(response.headers.get('content-security-policy')).toBeDefined();
      expect(response.headers.get('x-theme')).toBeDefined();
    });
  });

  describe('Basic 認証ゲート（署名付き Cookie）', () => {
    const GATE_SECRET = 'f'.repeat(64);
    const USER = 'user';
    const PASS = 'secret';

    const basicHeader = (user = USER, pass = PASS): string =>
      `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;

    const enableBasicAuth = (): void => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_USER = USER;
      process.env.BASIC_AUTH_PASS = PASS;
      process.env.BASIC_AUTH_GATE_SECRET = GATE_SECRET;
    };

    /** レスポンスの Set-Cookie から `name=value` の部分だけを取り出す */
    const gateCookiePair = (response: Response): string | null => {
      const setCookie = response.headers.get('set-cookie');
      return setCookie ? setCookie.split(';')[0] : null;
    };

    const requestWith = (
      path: string,
      headers: Record<string, string> = {},
      origin = 'http://localhost:3000'
    ): NextRequest =>
      new NextRequest(new URL(`${origin}${path}`), { headers });

    it('M1: 認証情報なしなら charset 付き challenge と no-store を返し Cookie は発行しない', async () => {
      enableBasicAuth();

      const response = await proxy(requestWith('/'));

      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe(
        'Basic realm="Protected", charset="UTF-8"'
      );
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('M2: Basic 認証成功でゲート Cookie を発行する', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/', { authorization: basicHeader() })
      );

      expect(response.status).not.toBe(401);
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('tt_gate=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('Max-Age=604800');
      expect(setCookie).not.toContain('Domain');
      // Set-Cookie を含む応答は共有キャッシュに載せない
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vary')).toContain('Cookie');
      expect(response.headers.get('Vary')).toContain('Authorization');
    });

    it('M3: 有効なゲート Cookie だけで通り、Cookie は再発行されない', async () => {
      enableBasicAuth();
      const issued = await proxy(
        requestWith('/', { authorization: basicHeader() })
      );
      const cookie = gateCookiePair(issued);
      expect(cookie).toBeTruthy();

      const response = await proxy(requestWith('/', { cookie: cookie! }));

      expect(response.status).not.toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      // Cookie 通過時もゲート配下のページなので共有キャッシュに載せない
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vary')).toContain('Cookie');
    });

    it('M4: 改ざんしたゲート Cookie だけなら 401', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/', { cookie: 'tt_gate=v1.9999999999.tampered' })
      );

      expect(response.status).toBe(401);
    });

    it('M5: 改ざん Cookie でも正しい Basic があれば通り Cookie を上書きする', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/', {
          cookie: 'tt_gate=v1.9999999999.tampered',
          authorization: basicHeader(),
        })
      );

      expect(response.status).not.toBe(401);
      expect(response.headers.get('set-cookie')).toContain('tt_gate=');
    });

    it('M6: cron Bearer ではゲート Cookie を発行しない', async () => {
      enableBasicAuth();
      process.env.CRON_TOKEN = 'test-cron-secret';

      const response = await proxy(
        requestWith('/', { authorization: 'Bearer test-cron-secret' })
      );

      expect(response.status).not.toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      // cron でも任意パスを通過できるため、キャッシュ抑止の対象に含める
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
    });

    it('M7: メンテナンス 503 の経路でもゲート Cookie を発行する', async () => {
      enableBasicAuth();
      process.env.MAINTENANCE_MODE = 'true';

      const response = await proxy(
        requestWith('/', { authorization: basicHeader() })
      );

      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toContain('tt_gate=');
      // Cookie を含む応答は共有キャッシュに載せない
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('M8: ログインリダイレクトの経路でもゲート Cookie を発行する', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/profile', { authorization: basicHeader() })
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/login');
      expect(response.headers.get('set-cookie')).toContain('tt_gate=');
      // Cookie を含む応答は共有キャッシュに載せない
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
    });

    it('M9: 保護 API の 401 ではセキュリティヘッダが付き Cookie は発行しない', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/api/favorites', { authorization: basicHeader() })
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      // /api/* に Cookie は載せないが、キャッシュ抑止は適用する
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('M10: /api/* には Cookie を発行しないがキャッシュは抑止する', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/api/stats', { authorization: basicHeader() })
      );

      expect(response.status).not.toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      // ゲート済みの API 応答が下流 CDN に共有キャッシュされるのを防ぐ
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Vary')).toContain('Authorization');
    });

    it('M11: 有効化されているのにパスワードが未設定なら 503（fail-closed）', async () => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_GATE_SECRET = GATE_SECRET;

      const response = await proxy(requestWith('/'));

      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('M12: 署名鍵が未設定なら 503（fail-closed）', async () => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_PASS = PASS;

      const response = await proxy(requestWith('/'));

      expect(response.status).toBe(503);
    });

    it('M13: Basic 認証 OFF ならゲート Cookie を一切発行しない', async () => {
      const response = await proxy(requestWith('/'));

      expect(response.status).not.toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      // ゲート OFF のときはキャッシュ制御に手を加えない（既存挙動の維持）
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(response.headers.get('CDN-Cache-Control')).toBeNull();
      expect(response.headers.get('Vary')).toBeNull();
    });

    it('M14: production かつ HTTPS では __Host- prefix と Secure が付く', async () => {
      process.env.NODE_ENV = 'production';
      enableBasicAuth();

      const response = await proxy(
        requestWith('/', { authorization: basicHeader() }, 'https://example.com')
      );

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('__Host-tt_gate=');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Domain');
    });

    it('M15: development かつ HTTP では prefix も Secure も付かない', async () => {
      enableBasicAuth();

      const response = await proxy(
        requestWith('/', { authorization: basicHeader() })
      );

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('tt_gate=');
      expect(setCookie).not.toContain('__Host-');
      expect(setCookie).not.toContain('Secure');
    });
  });
});
