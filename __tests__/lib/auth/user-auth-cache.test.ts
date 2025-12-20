/**
 * Unit tests for user authentication cache
 *
 * Note: Due to Jest moduleNameMapper configuration, Redis mock is handled by
 * __mocks__/lib/redis/factory.ts. Full Redis behavior is tested in integration tests.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

import {
  getUserAuthData,
  invalidateUserAuthCache,
  isUserValid,
} from '@/lib/auth/user-auth-cache';
import { prisma } from '@/lib/prisma';

const mockPrismaUser = prisma.user as jest.Mocked<typeof prisma.user>;

describe('user-auth-cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserAuthData', () => {
    it('returns null when user not found in DB', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getUserAuthData('non-existent');

      expect(result).toBeNull();
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent' },
        select: { role: true, deletedAt: true },
      });
    });

    it('converts deletedAt to ISO string', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        role: 'user',
        deletedAt: new Date('2025-01-15T10:00:00Z'),
      });

      const result = await getUserAuthData('deleted-user');

      expect(result).toEqual({
        role: 'user',
        deletedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('defaults role to user when null', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({ role: null, deletedAt: null });

      const result = await getUserAuthData('user-no-role');

      expect(result).toEqual({ role: 'user', deletedAt: null });
    });

    it('returns user data when found in DB', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        role: 'admin',
        deletedAt: null,
      });

      const result = await getUserAuthData('existing-user');

      expect(result).toEqual({
        role: 'admin',
        deletedAt: null,
      });
    });
  });

  describe('invalidateUserAuthCache', () => {
    it('does not throw on call', async () => {
      await expect(invalidateUserAuthCache('user-id')).resolves.toBeUndefined();
    });
  });

  describe('isUserValid', () => {
    it('returns false for deleted user', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        role: 'user',
        deletedAt: new Date('2025-01-15T10:00:00Z'),
      });

      const result = await isUserValid('deleted-user');

      expect(result).toBe(false);
    });

    it('returns false for non-existent user', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await isUserValid('non-existent');

      expect(result).toBe(false);
    });

    it('returns true for existing non-deleted user', async () => {
      (mockPrismaUser.findUnique as jest.Mock).mockResolvedValue({
        role: 'user',
        deletedAt: null,
      });

      const result = await isUserValid('valid-user');

      expect(result).toBe(true);
    });
  });
});
