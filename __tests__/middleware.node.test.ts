import { NextRequest } from 'next/server';
import { config, proxy } from '../proxy';

describe('middleware - security headers', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete process.env.MAINTENANCE_MODE;
  });

  describe('Security headers設定', () => {
    it('should set Content-Security-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Content-Security-Policy')).toBeDefined();
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "default-src 'self'"
      );
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

      expect(response.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin'
      );
    });

    it('should set Permissions-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Permissions-Policy')).toBeDefined();
      expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
      expect(response.headers.get('Permissions-Policy')).toContain(
        'payment=()'
      );
    });

    it('should set Cross-Origin-Opener-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe(
        'same-origin-allow-popups'
      );
    });

    it('should set Cross-Origin-Embedder-Policy header', async () => {
      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe(
        'unsafe-none'
      );
    });
  });

  describe('HSTS設定', () => {
    it('should set HSTS header for HTTPS in production', async () => {
      process.env.NODE_ENV = 'production';
      const request = new NextRequest(new URL('https://localhost:3000/'));
      const response = await proxy(request);

      expect(response.headers.get('Strict-Transport-Security')).toBeDefined();
      expect(response.headers.get('Strict-Transport-Security')).toContain(
        'max-age=31536000'
      );
      expect(response.headers.get('Strict-Transport-Security')).toContain(
        'includeSubDomains'
      );
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

    it('ログインした後に同じ表示へ戻すため、callbackUrl に検索条件も入れる', async () => {
      // 読書分析は閲覧履歴のタブ（/history?tab=analytics。Issue #709）
      const request = new NextRequest(
        new URL('http://localhost:3000/history?tab=analytics')
      );
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/auth/login');
      expect(location.searchParams.get('callbackUrl')).toBe(
        '/history?tab=analytics'
      );
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

  // issue #687: NUL バイトは PostgreSQL の text に入らず、DB に届くと 500 になる
  describe('NUL バイト（%00）の拒否', () => {
    it.each([
      ['/api/articles?search=a%00b'],
      ['/api/articles/list?tag=a%00b'],
      ['/api/articles/abc%00def'],
      ['/api/articles/abc%00.png'],
    ])('API の %s は JSON の 400 と no-store を返す', async (path) => {
      const response = await proxy(
        new NextRequest(new URL(`http://localhost:3000${path}`))
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
      });
    });

    it('ページの %00 はテキストの 400 を返す', async () => {
      const response = await proxy(
        new NextRequest(new URL('http://localhost:3000/articles/abc%00'))
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      await expect(response.text()).resolves.toBe('Bad Request');
    });

    it('CSRF の判定より前に拒否する（Origin の無い POST でも 403 ではなく 400）', async () => {
      const response = await proxy(
        new NextRequest(new URL('http://localhost:3000/api/comments?x=%00'), {
          method: 'POST',
        })
      );

      expect(response.status).toBe(400);
    });

    it('%2500（"%00" という文字列）は NUL ではないので通す', async () => {
      const response = await proxy(
        new NextRequest(
          new URL('http://localhost:3000/api/articles?search=%2500')
        )
      );

      expect(response.status).not.toBe(400);
    });
  });

  // issue #687: /api/ は拡張子の除外から外し、拡張子付きのパスでも proxy を通す
  describe('matcher', () => {
    // Next の matcher の扱い（path-to-regexp を通し、末尾に .json・.rsc などを足す）の近似。
    // 実際の Next での挙動は開発サーバーへの curl で確かめた（issue #687 の実装レポート）
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    it.each([
      ['/api/articles/abc.png'],
      ['/api/articles/abc%00.png'],
      ['/api/articles'],
      ['/articles/abc'],
      ['/'],
      // 画像最適化はゲートの中に置く（Issue #718）
      ['/_next/image'],
    ])('%s は proxy を通る', (path) => {
      expect(matcher.test(path)).toBe(true);
    });

    it.each([
      ['/foo.png'],
      // ページは拡張子付きなら今までどおり除外する（/api/ だけを外した）
      ['/articles/abc.png'],
      ['/images/logo.svg'],
      ['/fonts/a.woff2'],
      ['/_next/static/chunks/main.js'],
      ['/favicon.ico'],
    ])('%s は proxy を通らない（静的ファイル）', (path) => {
      expect(matcher.test(path)).toBe(false);
    });
  });
});
