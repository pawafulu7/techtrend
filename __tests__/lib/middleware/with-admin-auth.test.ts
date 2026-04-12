// Mock definitions first (hoisting)
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/auth/user-auth-cache');

// Imports
import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { getSession } from '@/lib/auth/get-session';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';
import logger from '@/lib/logger';

// Mock function references
const mockAuth = getSession as jest.MockedFunction<typeof getSession>;
const mockGetUserAuthData = getUserAuthData as jest.MockedFunction<
  typeof getUserAuthData
>;
let mockLoggerWarn: jest.SpyInstance;

describe('withAdminAuth', () => {
  const mockHandler = jest.fn().mockImplementation(async () => {
    return NextResponse.json({ success: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerWarn = jest.spyOn(logger as any, 'warn');
  });

  describe('Unauthenticated requests', () => {
    it('should return 401 when no session exists', async () => {
      mockAuth.mockResolvedValue(null);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/test', {
        method: 'GET',
      });

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Authentication required.');
      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockGetUserAuthData).not.toHaveBeenCalled();
    });

    it('should return 401 when session has no user id', async () => {
      mockAuth.mockResolvedValue({ user: {} } as any);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/test', {
        method: 'GET',
      });

      const response = await handler(request);

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Deleted user handling', () => {
    it('should return 401 with USER_DELETED code when user is deleted', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'deleted@example.com' },
      } as any);
      mockGetUserAuthData.mockResolvedValue({
        role: 'admin',
        deletedAt: new Date('2026-01-01'),
      } as any);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/test', {
        method: 'GET',
      });

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe('USER_DELETED');
      expect(body.requiresLogout).toBe(true);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should return 401 when authData is null (user not found)', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-nonexistent', email: 'ghost@example.com' },
      } as any);
      mockGetUserAuthData.mockResolvedValue(null);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/test', {
        method: 'GET',
      });

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe('USER_DELETED');
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Non-admin user handling', () => {
    it('should return 403 for non-admin user', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com' },
      } as any);
      mockGetUserAuthData.mockResolvedValue({
        role: 'user',
        deletedAt: null,
      } as any);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/users', {
        method: 'GET',
      });

      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toBe('Admin access required.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should log warning for non-admin access attempt', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-42', email: 'hacker@example.com' },
      } as any);
      mockGetUserAuthData.mockResolvedValue({
        role: 'user',
        deletedAt: null,
      } as any);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/users', {
        method: 'GET',
      });

      await handler(request);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-42',
          role: 'user',
          path: '/api/admin/users',
        }),
        'Non-admin user attempted admin API access'
      );
    });
  });

  describe('Admin user handling', () => {
    it('should pass through for admin user and call handler', async () => {
      const adminSession = {
        user: { id: 'admin-1', email: 'admin@example.com' },
      };
      mockAuth.mockResolvedValue(adminSession as any);
      mockGetUserAuthData.mockResolvedValue({
        role: 'admin',
        deletedAt: null,
      } as any);

      const handler = withAdminAuth(mockHandler);
      const request = new NextRequest('http://localhost/api/admin/stats', {
        method: 'GET',
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ session: adminSession })
      );
    });

    it('should merge existing context with session', async () => {
      const adminSession = {
        user: { id: 'admin-1', email: 'admin@example.com' },
      };
      mockAuth.mockResolvedValue(adminSession as any);
      mockGetUserAuthData.mockResolvedValue({
        role: 'admin',
        deletedAt: null,
      } as any);

      const innerHandler = jest
        .fn()
        .mockResolvedValue(NextResponse.json({ ok: true }));
      const handler = withAdminAuth(innerHandler);
      const request = new NextRequest('http://localhost/api/admin/test', {
        method: 'GET',
      });

      await handler(request, { existingKey: 'value' });

      expect(innerHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          existingKey: 'value',
          session: adminSession,
        })
      );
    });
  });
});
