import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// Mock auth
jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

// Mock changePassword
jest.mock('@/lib/auth/utils', () => ({
  changePassword: jest.fn()
}));

// Mock rate limiter (preserve RateLimitError class)
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest.fn().mockResolvedValue({ limit: 5, remaining: 4, reset: new Date() }),
    createRateLimiterFromConfig: jest.fn().mockReturnValue({
      consume: jest.fn().mockResolvedValue({}),
    }),
  };
});

// Import POST after mocks are set up
const { POST } = require('@/app/api/user/password/route');
const { prisma } = require('@/lib/prisma');

// withUserValidation が引く DB のユーザー。既定では、問い合わせた ID の未退会ユーザーを返す
function setUserRecord(deletedAt: Date | null) {
  (prisma.user.findUnique as jest.Mock).mockImplementation(
    async (args: { where: { id: string } }) => ({ id: args.where.id, deletedAt })
  );
}

describe('/api/user/password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setUserRecord(null);
  });

  describe('POST', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue(null);

      // 同一オリジンのリクエスト（route 単体の CSRF 保護を通過させ、認証の判定を見る）
      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(data.code).toBe('NOT_AUTHENTICATED');
      const { changePassword } = require('@/lib/auth/utils');
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('should return 401 USER_DELETED when the user has been deleted', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });
      setUserRecord(new Date('2026-09-30T00:00:00.000Z'));

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('USER_DELETED');
      const { changePassword } = require('@/lib/auth/utils');
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('should return 403 for a cross-origin request even with a valid session', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('CSRF validation failed');
      const { changePassword } = require('@/lib/auth/utils');
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('should return 400 when passwords do not match', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'DifferentPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.confirmPassword).toContain("Passwords don't match");
    });

    it('should return 400 when new password does not meet requirements', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'short',
          confirmPassword: 'short',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.newPassword).toBeDefined();
    });

    it('should return 400 when current password is incorrect', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('Invalid current password')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'wrongPassword',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Current password is incorrect');
    });

    it('should successfully change password when all inputs are valid', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });
      
      (changePassword as jest.Mock).mockResolvedValue(2);

      // Cookie の値（"token.署名"）は getSession の token と違う。route は Cookie ではなく
      // getSession の token を渡す必要がある（Cookie の値だと操作中のセッションも消える）
      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'better-auth.session_token=t1.signature%3D',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Password changed successfully');
      // 失効させた件数は応答に出さない
      expect(data).not.toHaveProperty('revokedSessions');
      expect(changePassword).toHaveBeenCalledWith(
        'user123',
        'oldPassword123',
        'NewPassword123',
        't1'
      );
    });

    it.each([
      ['Session is no longer valid', 401, 'Unauthorized'],
      [
        'Password was changed concurrently',
        409,
        'Password was changed by another request',
      ],
    ])(
      'should map "%s" from changePassword to %i',
      async (message, status, error) => {
        const { auth } = require('@/lib/auth/auth');
        const { changePassword } = require('@/lib/auth/utils');

        (auth.api.getSession as jest.Mock).mockResolvedValue({
          user: { id: 'user123', email: 'test@example.com' },
          session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
        });
        (changePassword as jest.Mock).mockRejectedValue(new Error(message));

        const request = new NextRequest('http://localhost:3000/api/user/password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: 'oldPassword123',
            newPassword: 'NewPassword123',
            confirmPassword: 'NewPassword123',
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(status);
        expect(data.error).toBe(error);
      }
    );

    it('should return 401 without changing the password when the session has no token', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('NOT_AUTHENTICATED');
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('should return 404 when user is not found', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('User not found')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { changePassword } = require('@/lib/auth/utils');
      
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });
      
      (changePassword as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: 'oldPassword123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle missing request body gracefully', async () => {
      const { auth } = require('@/lib/auth/auth');
      
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      const request = new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details.currentPassword).toBeDefined();
      expect(data.details.newPassword).toBeDefined();
      expect(data.details.confirmPassword).toBeDefined();
    });
  });
});