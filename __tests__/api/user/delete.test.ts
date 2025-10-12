import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

// モック設定（password.test.tsと同じパターン）
jest.mock('@/lib/database');
jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn()
}));
jest.mock('@/lib/auth/utils', () => ({
  verifyPassword: jest.fn(),
  deleteUserAccountWithAudit: jest.fn(),
  hashPassword: jest.fn(),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  updateUserProfile: jest.fn(),
  changePassword: jest.fn(),
  deleteUserAccount: jest.fn(),
}));

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
      (auth as jest.Mock).mockResolvedValue(null);

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
      expect(data.success).toBe(false);
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return 400 when confirmation word is invalid', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
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

    it('should return 404 when user is not found', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
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

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('USER_NOT_FOUND');
    });

    it('should return 403 when password is missing for password user', async () => {
      const { auth } = require('@/lib/auth/auth');
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
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

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_PASSWORD');
    });

    it('should return 403 when password is incorrect', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { verifyPassword } = require('@/lib/auth/utils');

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
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

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toBe('INVALID_PASSWORD');
    });

    it('should successfully delete password user account', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { verifyPassword, deleteUserAccountWithAudit } = require('@/lib/auth/utils');

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
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

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'oauth@example.com' }
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'oauth@example.com',
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

    it('should return 500 when an unexpected error occurs', async () => {
      const { auth } = require('@/lib/auth/auth');
      const { deleteUserAccountWithAudit } = require('@/lib/auth/utils');

      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user123', email: 'test@example.com' }
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'test@example.com',
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
    });
  });
});
