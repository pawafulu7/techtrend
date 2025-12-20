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

// インポート（モック設定後）
import { validateUser, createUserDeletedResponse } from '@/lib/middleware/with-user-validation';
import { prisma } from '@/lib/database';

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
