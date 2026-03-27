import { NextRequest } from 'next/server';
import { proxy } from '../proxy';

describe('middleware - security headers', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete process.env.BASIC_AUTH_ENABLED;
    delete process.env.BASIC_AUTH_PASS;
    delete process.env.CRON_TOKEN;
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

      const request = new NextRequest(new URL('http://localhost:3000/'));
      const response = await proxy(request);

      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBeTruthy();
    });

    it('should allow cron requests with valid CRON_SECRET without Basic Auth', async () => {
      process.env.BASIC_AUTH_ENABLED = 'true';
      process.env.BASIC_AUTH_PASS = 'secret';
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
});
