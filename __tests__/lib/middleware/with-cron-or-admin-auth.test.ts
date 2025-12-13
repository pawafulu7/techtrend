// Mock定義を最初に配置（ホイスティング対策）
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/auth/auth');

// インポート
import { NextRequest, NextResponse } from 'next/server';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';

// モック関数の取得
const mockAuth = auth as jest.MockedFunction<typeof auth>;
let mockLoggerWarn: jest.SpyInstance;

describe('withCronOrAdminAuth', () => {
  const mockHandler = jest.fn().mockImplementation(async () => {
    return NextResponse.json({ success: true });
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockLoggerWarn = jest.spyOn(logger as any, 'warn');
    // Reset env vars
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_TOKEN;
  });

  describe('Cron Secret Authentication', () => {
    it('should authenticate with valid Bearer token (CRON_SECRET)', async () => {
      process.env.CRON_SECRET = 'valid-secret-token-12345';

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-secret-token-12345',
        },
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled(); // Should skip session check
    });

    it('should authenticate with valid Bearer token (CRON_TOKEN)', async () => {
      process.env.CRON_TOKEN = 'valid-cron-token-67890';

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-cron-token-67890',
        },
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should prefer CRON_TOKEN over CRON_SECRET when both are set', async () => {
      process.env.CRON_TOKEN = 'preferred-token';
      process.env.CRON_SECRET = 'secondary-secret';

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer preferred-token',
        },
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should reject invalid Bearer token', async () => {
      process.env.CRON_SECRET = 'valid-secret';
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });

      const response = await handler(request);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject non-Bearer authorization header', async () => {
      process.env.CRON_SECRET = 'valid-secret';
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      const response = await handler(request);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Admin Session Authentication', () => {
    it('should authenticate admin user', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      } as any);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should reject non-admin user', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com', role: 'USER' },
      } as any);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const response = await handler(request);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated request', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const response = await handler(request);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should pass session in context for admin users', async () => {
      const adminSession = {
        user: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      };
      mockAuth.mockResolvedValue(adminSession as any);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      await handler(request);

      // Check that handler was called with session in context
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ session: adminSession })
      );
    });
  });

  describe('Security Features', () => {
    it('should log unauthorized access attempts', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/summaries/generate', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'Suspicious Bot/1.0',
        },
      });

      await handler(request);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/summaries/generate',
          method: 'POST',
          ip: '192.168.1.100',
          userAgent: 'Suspicious Bot/1.0',
          hasAuthHeader: false,
          hasSession: false,
        }),
        'Unauthorized AI generation API access attempt'
      );
    });

    it('should log authorization header presence (but not value)', async () => {
      process.env.CRON_SECRET = 'valid-secret';
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong-token',
        },
      });

      await handler(request);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          hasAuthHeader: true,
        }),
        expect.any(String)
      );

      // Ensure the actual token is NOT logged
      const logCall = mockLoggerWarn.mock.calls[0];
      expect(JSON.stringify(logCall)).not.toContain('wrong-token');
    });

    it('should return appropriate error message', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const response = await handler(request);
      const body = await response.json();

      expect(body).toEqual({
        error: 'Unauthorized',
        message: 'This endpoint requires Cron Secret or Admin authentication.',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty CRON_SECRET gracefully', async () => {
      process.env.CRON_SECRET = '';
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN' },
      } as any);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer some-token',
        },
      });

      const response = await handler(request);

      // Should fall back to session auth and succeed for admin
      expect(response.status).toBe(200);
    });

    it('should handle undefined CRON_SECRET and CRON_TOKEN', async () => {
      // Both are already undefined in beforeEach
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', role: 'ADMIN' },
      } as any);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const response = await handler(request);

      // Should proceed to session auth
      expect(response.status).toBe(200);
    });

    it('should extract first IP from x-forwarded-for chain', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.1, 192.0.2.1',
        },
      });

      await handler(request);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '203.0.113.1',
        }),
        expect.any(String)
      );
    });

    it('should handle missing x-forwarded-for header', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withCronOrAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      await handler(request);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: 'unknown',
        }),
        expect.any(String)
      );
    });
  });

  describe('Integration with other middleware', () => {
    it('should work as outer wrapper for handler chain', async () => {
      process.env.CRON_SECRET = 'valid-secret';

      // Simulate wrapping another middleware
      const innerMiddleware = jest.fn().mockImplementation(async () => {
        return NextResponse.json({ inner: true });
      });

      const handler = withCronOrAdminAuth(innerMiddleware);
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-secret',
        },
      });

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ inner: true });
      expect(innerMiddleware).toHaveBeenCalled();
    });
  });
});
