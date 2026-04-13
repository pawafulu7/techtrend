/**
 * CSRF Protection Middleware Tests
 */
import { NextRequest } from 'next/server';
import {
  validateOrigin,
  isCSRFExemptPath,
  requiresCSRFProtection,
  csrfProtection,
  withCSRFProtection,
  CSRF_EXEMPT_PATHS,
  CSRF_PROTECTED_METHODS,
} from '@/lib/middleware/csrf-protection';
import { extendWithSessionContext } from '@/lib/middleware/session-context';
import { resetEnvCache } from '@/lib/config/env';

// Mock getSession function (kept for any direct callers)
jest.mock('@/lib/auth/get-session', () => ({
  getSession: jest.fn(),
}));

import { getSession } from '@/lib/auth/get-session';

const mockAuth = getSession as jest.MockedFunction<typeof getSession>;

// auth.api.getSession ヘルパー（validateOrigin が resolveSession 経由で呼ぶ）
const getAuthApiGetSession = () => {
  const { auth } = require('@/lib/auth/auth');
  return auth.api.getSession as jest.Mock;
};

describe('csrf-protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.CSRF_TRUSTED_ORIGINS;
    resetEnvCache();
    // デフォルトは未認証（auth.api.getSession）
    getAuthApiGetSession().mockResolvedValue(null);
  });

  describe('validateOrigin', () => {
    it('should allow same-origin requests', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(true);
    });

    it('should allow browser same-origin requests even if scheme differs at proxy', async () => {
      const request = new NextRequest(
        new URL('http://app.example.com/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'https://app.example.com',
            'sec-fetch-site': 'same-origin',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(true);
    });

    it('should allow requests with matching referer', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            referer: 'http://localhost:3000/some-page',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(true);
    });

    it('should reject requests from different origin', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://evil.com',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(false);
    });

    it('should allow requests with valid Authorization header and session', async () => {
      getAuthApiGetSession().mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: {
          id: 's1',
          userId: 'user-1',
          token: 'tok',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://different-origin.com',
            authorization: 'Bearer valid-token',
          },
        }
      );

      // validateOriginはextendWithSessionContextで渡されたrequestHeadersからsessionを解決する
      const ctx = extendWithSessionContext(undefined, request.headers);
      const result = await validateOrigin(request, ctx);
      expect(result).toBe(true);
    });

    it('should reject requests with Authorization header but no valid session', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://evil.com',
            authorization: 'Bearer fake-token',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(false);
    });

    it('should allow requests from NEXTAUTH_URL', async () => {
      process.env.NEXTAUTH_URL = 'https://myapp.example.com';
      resetEnvCache();

      const request = new NextRequest(
        new URL('https://myapp.example.com/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'https://myapp.example.com',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(true);
    });

    it('should allow requests from CSRF_TRUSTED_ORIGINS', async () => {
      process.env.CSRF_TRUSTED_ORIGINS =
        'https://trusted1.com, https://trusted2.com';
      resetEnvCache();

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'https://trusted1.com',
          },
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(true);
    });

    it('should reject requests without Origin or Referer and no session', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
        }
      );

      const result = await validateOrigin(request);
      expect(result).toBe(false);
    });

    it('should allow requests without Origin or Referer but with valid session', async () => {
      getAuthApiGetSession().mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
        session: {
          id: 's1',
          userId: 'user-1',
          token: 'tok',
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
        }
      );

      // validateOriginはextendWithSessionContextで渡されたrequestHeadersからsessionを解決する
      const ctx = extendWithSessionContext(undefined, request.headers);
      const result = await validateOrigin(request, ctx);
      expect(result).toBe(true);
    });
  });

  describe('isCSRFExemptPath', () => {
    it('should return true for exempt paths', () => {
      expect(isCSRFExemptPath('/api/auth/callback/google')).toBe(true);
      expect(isCSRFExemptPath('/api/auth/signin')).toBe(true);
      expect(isCSRFExemptPath('/api/auth/signout')).toBe(true);
      expect(isCSRFExemptPath('/api/auth/session')).toBe(true);
      expect(isCSRFExemptPath('/api/health')).toBe(true);
    });

    it('should return true for exact match of exempt paths', () => {
      expect(isCSRFExemptPath('/api/auth/callback')).toBe(true);
      expect(isCSRFExemptPath('/api/health')).toBe(true);
    });

    it('should return false for non-exempt paths', () => {
      expect(isCSRFExemptPath('/api/articles')).toBe(false);
      expect(isCSRFExemptPath('/api/user/profile')).toBe(false);
    });

    it('should return true for /api/auth/* subpaths (Better Auth handles its own CSRF)', () => {
      // /api/auth プレフィックスは全てexempt（Better Auth が自前のCSRF保護を持つため）
      expect(isCSRFExemptPath('/api/auth/register-with-email')).toBe(true);
      expect(isCSRFExemptPath('/api/auth/callbackadmin')).toBe(true);
      expect(isCSRFExemptPath('/api/auth/signinpage')).toBe(true);
    });

    it('should reject paths that only share prefix but are not subpaths', () => {
      // /api/healthcheck は /api/health の部分一致ではなく異なるパス
      expect(isCSRFExemptPath('/api/healthcheck')).toBe(false);
    });
  });

  describe('requiresCSRFProtection', () => {
    it('should return true for modifying methods', () => {
      expect(requiresCSRFProtection('POST')).toBe(true);
      expect(requiresCSRFProtection('PUT')).toBe(true);
      expect(requiresCSRFProtection('PATCH')).toBe(true);
      expect(requiresCSRFProtection('DELETE')).toBe(true);
    });

    it('should return false for safe methods', () => {
      expect(requiresCSRFProtection('GET')).toBe(false);
      expect(requiresCSRFProtection('HEAD')).toBe(false);
      expect(requiresCSRFProtection('OPTIONS')).toBe(false);
    });
  });

  describe('csrfProtection', () => {
    it('should return null for GET requests', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/articles'),
        {
          method: 'GET',
        }
      );

      const result = await csrfProtection(request);
      expect(result).toBeNull();
    });

    it('should return null for exempt paths', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/auth/callback/google'),
        {
          method: 'POST',
          headers: {
            origin: 'http://evil.com',
          },
        }
      );

      const result = await csrfProtection(request);
      expect(result).toBeNull();
    });

    it('should return 403 for invalid origin on POST', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/articles'),
        {
          method: 'POST',
          headers: {
            origin: 'http://evil.com',
          },
        }
      );

      const result = await csrfProtection(request);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);

      const body = await result?.json();
      expect(body.error).toBe('CSRF validation failed');
    });

    it('should return null for valid origin on POST', async () => {
      const request = new NextRequest(
        new URL('http://localhost:3000/api/articles'),
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      );

      const result = await csrfProtection(request);
      expect(result).toBeNull();
    });
  });

  describe('withCSRFProtection', () => {
    it('should call handler for valid requests', async () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withCSRFProtection(handler);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      );

      const result = await wrappedHandler(request);
      // Handler is now called with request and SessionContext for auth() optimization
      expect(handler).toHaveBeenCalledWith(request, expect.any(Object));
      expect(result).toEqual({ success: true });
    });

    it('should return 403 without calling handler for invalid requests', async () => {
      getAuthApiGetSession().mockResolvedValue(null);

      const handler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withCSRFProtection(handler);

      const request = new NextRequest(
        new URL('http://localhost:3000/api/test'),
        {
          method: 'POST',
          headers: {
            origin: 'http://evil.com',
          },
        }
      );

      const result = await wrappedHandler(request);
      expect(handler).not.toHaveBeenCalled();
      expect(result.status).toBe(403);
    });
  });

  describe('constants', () => {
    it('should have expected exempt paths', () => {
      expect(CSRF_EXEMPT_PATHS).toContain('/api/auth');
      expect(CSRF_EXEMPT_PATHS).toContain('/api/health');
    });

    it('should have expected protected methods', () => {
      expect(CSRF_PROTECTED_METHODS).toContain('POST');
      expect(CSRF_PROTECTED_METHODS).toContain('PUT');
      expect(CSRF_PROTECTED_METHODS).toContain('PATCH');
      expect(CSRF_PROTECTED_METHODS).toContain('DELETE');
    });
  });
});
