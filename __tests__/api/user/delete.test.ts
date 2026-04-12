import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// モック設定（password.test.tsと同じパターン）
jest.mock('@/lib/database');
jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));
jest.mock('@/lib/auth/utils', () => ({
  verifyPassword: jest.fn(),
  deleteUserAccountWithAudit: jest.fn(),
}));

// Mock rate limiter (preserve RateLimitError class)
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual('@/lib/rate-limiter');
  return {
    ...actual,
    checkRateLimit: jest.fn().mockResolvedValue({ limit: 3, remaining: 2, reset: new Date() }),
    createRateLimiterFromConfig: jest.fn().mockReturnValue({
      consume: jest.fn().mockResolvedValue({}),
    }),
  };
});

// Import DELETE after mocks are set up
const { DELETE } = require('@/app/api/user/delete/route');
import { prisma } from '@/lib/database';

const prismaMock = prisma as any;

describe('/api/user/delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // デフォルトのPrismaモック設定
    prismaMock.user = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
  });

  describe('DELETE', () => {
    it('should return 401 when user is not authenticated', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify({
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(data.code).toBe('NOT_AUTHENTICATED');
    });

    it('should return 400 when confirmation word is invalid', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
        password: null,
      });

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationWord: 'WRONG',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when user is not found (withUserValidation)', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Session invalid');
      expect(data.code).toBe('USER_DELETED');
    });

    it('should return 400 when password is missing for password user', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        password: 'hashedPassword123',
      });

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_PASSWORD');
    });

    it('should return 401 when password is incorrect', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { verifyPassword } = require('@/lib/auth/utils');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword123',
      });

      (verifyPassword as jest.Mock).mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'WrongPassword',
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_PASSWORD');
    });

    it('should successfully delete password user account', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { verifyPassword, deleteUserAccountWithAudit } = require('@/lib/auth/utils');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        password: 'hashedPassword123',
      });

      (verifyPassword as jest.Mock).mockResolvedValue(true);
      (deleteUserAccountWithAudit as jest.Mock).mockResolvedValue({
        email: 'test@example.com',
        authMethod: 'credentials',
      });

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: 'CurrentPassword123',
          confirmationWord: 'DELETE',
          reason: 'Test deletion',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.requiresLogout).toBe(true);
      expect(verifyPassword).toHaveBeenCalledWith('CurrentPassword123', 'hashedPassword123');
      expect(deleteUserAccountWithAudit).toHaveBeenCalledWith(
        'user123',
        {
          reason: 'Test deletion',
          clientIp: undefined,
          userAgent: undefined,
        }
      );
    });

    it('should successfully delete OAuth user account', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { deleteUserAccountWithAudit } = require('@/lib/auth/utils');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'oauth@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        password: null,
      });

      (deleteUserAccountWithAudit as jest.Mock).mockResolvedValue({
        email: 'oauth@example.com',
        authMethod: 'google',
      });

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.requiresLogout).toBe(true);
      expect(deleteUserAccountWithAudit).toHaveBeenCalledWith(
        'user123',
        {
          reason: undefined,
          clientIp: undefined,
          userAgent: undefined,
        }
      );
    });

    it('should return 400 when request body is malformed JSON', async () => {
      const { auth } = require('@/lib/auth/auth');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        password: null,
      });

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{invalid json}',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toBe('リクエストの形式が正しくありません');
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { deleteUserAccountWithAudit } = require('@/lib/auth/utils');

      (auth.api.getSession as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' },
        session: { id: 's1', userId: 'user123', token: 't1', expiresAt: new Date() },
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        password: null,
      });

      (deleteUserAccountWithAudit as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationWord: 'DELETE',
        }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('INTERNAL_ERROR');
    });
  });
});
