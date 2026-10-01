/**
 * Unit tests for with-user-validation middleware
 */

// モック設定（インポート前に宣言）
jest.mock('@/lib/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/middleware/session-context', () => ({
  resolveSessionFromRequest: jest.fn(),
}));

// インポート（モック設定後）
import { NextRequest } from 'next/server';
import {
  validateUser,
  createUserDeletedResponse,
  withUserValidation,
} from '@/lib/middleware/with-user-validation';
import { prisma } from '@/lib/database';
import { prisma as appPrisma } from '@/lib/prisma';
import { resolveSessionFromRequest } from '@/lib/middleware/session-context';
import { logger } from '@/lib/logger';

const mockPrismaUser = prisma.user as jest.Mocked<typeof prisma.user>;

describe('with-user-validation middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('returns null when session is null', async () => {
      const result = await validateUser(null);
      expect(result).toBeNull();
    });

    it('returns null when session has no user', async () => {
      const result = await validateUser({ user: undefined });
      expect(result).toBeNull();
    });

    it('returns null when session user has no id', async () => {
      const result = await validateUser({ user: {} });
      expect(result).toBeNull();
    });

    it('returns null when user is not found in database', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await validateUser({ user: { id: 'non-existent-id' } });

      expect(result).toBeNull();
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-id' },
        select: { id: true, deletedAt: true },
      });
    });

    it('returns null when user is deleted', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        id: 'deleted-user-id',
        deletedAt: new Date('2025-01-01'),
      });

      const result = await validateUser({ user: { id: 'deleted-user-id' } });

      expect(result).toBeNull();
    });

    it('returns validated user when user exists and is not deleted', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        id: 'valid-user-id',
        deletedAt: null,
      });

      const result = await validateUser({ user: { id: 'valid-user-id' } });

      expect(result).toEqual({ id: 'valid-user-id', deletedAt: null });
    });
  });

  describe('withUserValidation', () => {
    const mockResolveSession = resolveSessionFromRequest as jest.Mock;
    const mockFindUnique = (appPrisma as any).user.findUnique as jest.Mock;

    function makeRequest() {
      return new NextRequest('http://localhost:3000/api/user/password', {
        method: 'POST',
      });
    }

    it('passes the validated user to the handler', async () => {
      mockResolveSession.mockResolvedValue({ user: { id: 'user-1' } });
      mockFindUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
      const handler = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));

      const response = await withUserValidation(handler)(makeRequest(), {});

      expect(response.status).toBe(204);
      expect(handler).toHaveBeenCalledWith(
        expect.any(NextRequest),
        expect.objectContaining({
          validatedUser: { id: 'user-1', deletedAt: null },
        })
      );
    });

    it('returns JSON 500 when resolving the session throws', async () => {
      mockResolveSession.mockRejectedValue(new Error('session store down'));
      const handler = jest.fn();

      const response = await withUserValidation(handler)(makeRequest(), {});

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(handler).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        // err キーは logger のシリアライザ（sanitizeError）を通る
        expect.objectContaining({
          err: expect.any(Error),
          path: '/api/user/password',
          method: 'POST',
        }),
        'User validation failed'
      );
    });

    it('returns JSON 500 when looking up the user throws', async () => {
      mockResolveSession.mockResolvedValue({ user: { id: 'user-1' } });
      mockFindUnique.mockRejectedValue(new Error('db down'));
      const handler = jest.fn();

      const response = await withUserValidation(handler)(makeRequest(), {});

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(handler).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        // err キーは logger のシリアライザ（sanitizeError）を通る
        expect.objectContaining({
          err: expect.any(Error),
          path: '/api/user/password',
          method: 'POST',
        }),
        'User validation failed'
      );
    });
  });

  describe('createUserDeletedResponse', () => {
    it('returns 401 response with USER_DELETED code', async () => {
      const response = createUserDeletedResponse();

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body).toEqual({
        error: 'Session invalid',
        code: 'USER_DELETED',
        message: 'Your session is no longer valid. Please sign in again.',
        requiresLogout: true,
      });
    });
  });
});
