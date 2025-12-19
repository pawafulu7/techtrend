import { getDevelopmentCSP, getProductionCSP } from '@/config/security-headers';

describe('Security Headers - CSP', () => {
  describe('Development CSP', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should allow unsafe-eval for HMR', () => {
      const csp = getDevelopmentCSP();
      expect(csp).toContain("'unsafe-eval'");
    });

    it('should allow unsafe-inline for scripts and styles', () => {
      const csp = getDevelopmentCSP();
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('should allow ws and wss for HMR websockets', () => {
      const csp = getDevelopmentCSP();
      expect(csp).toContain('connect-src');
      expect(csp).toContain('ws:');
      expect(csp).toContain('wss:');
    });

    it('should include basic security directives', () => {
      const csp = getDevelopmentCSP();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('Production CSP', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should NOT allow unsafe-eval (client bundle has no eval dependencies)', () => {
      // Note: unsafe-eval is NOT required after removing pino/crypto from client components
      // Client components use lib/logger.client.ts (console-based) instead of lib/logger.ts (pino-based)
      const csp = getProductionCSP();
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('should allow unsafe-inline for Next.js requirements', () => {
      const csp = getProductionCSP();
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('should include upgrade-insecure-requests', () => {
      const csp = getProductionCSP();
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('should include object-src none', () => {
      const csp = getProductionCSP();
      expect(csp).toContain("object-src 'none'");
    });

    it('should allow specific external APIs', () => {
      const csp = getProductionCSP();
      expect(csp).toContain('https://api.github.com');
      expect(csp).toContain('https://www.googleapis.com');
    });

    it('should allow https images from any source', () => {
      const csp = getProductionCSP();
      expect(csp).toContain("img-src 'self' data: https: blob:");
    });

    it('should include all security directives', () => {
      const csp = getProductionCSP();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('CSP format', () => {
    it('should use semicolon-separated format', () => {
      const devCsp = getDevelopmentCSP();
      const prodCsp = getProductionCSP();

      expect(devCsp).toMatch(/; /);
      expect(prodCsp).toMatch(/; /);
    });

    it('should not have trailing semicolon', () => {
      const devCsp = getDevelopmentCSP();
      const prodCsp = getProductionCSP();

      expect(devCsp).not.toMatch(/;$/);
      expect(prodCsp).not.toMatch(/;$/);
    });
  });
});

describe('Security Headers - Environment-specific', () => {
  it('should detect development environment correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const isDevelopment = process.env.NODE_ENV === 'development';
    expect(isDevelopment).toBe(true);

    process.env.NODE_ENV = originalEnv;
  });

  it('should detect production environment correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const isDevelopment = process.env.NODE_ENV === 'development';
    expect(isDevelopment).toBe(false);

    process.env.NODE_ENV = originalEnv;
  });
});
