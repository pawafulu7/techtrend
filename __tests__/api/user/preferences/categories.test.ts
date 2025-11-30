/**
 * User Category Preferences API Tests
 */

import { GET, POST } from '@/app/api/user/preferences/categories/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Mock auth
const mockAuth = jest.fn();
jest.mock('@/lib/auth/auth', () => ({
  auth: () => mockAuth(),
}));

// Use shared Prisma mock from __mocks__/lib/prisma
jest.mock('@/lib/prisma');
const prismaMock = prisma as jest.Mocked<typeof prisma>;
const { resetPrismaMock } = jest.requireMock('@/lib/prisma') as {
  resetPrismaMock: () => void;
};

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sanitizeError: (e: Error) => ({ message: e.message }),
}));

describe('User Category Preferences API', () => {
  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
  });

  describe('GET /api/user/preferences/categories', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return user preferences', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1', category: { slug: 'frontend' } },
        { categoryId: 'cat-2', category: { slug: 'ai-ml' } },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-1', 'cat-2']);
      expect(data.filterEnabled).toBe(true);
      expect(data.periodMonths).toBe(12);
    });

    it('should return empty preferences for new users', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual([]);
      expect(data.filterEnabled).toBe(false);
    });

    it('should handle database errors', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to retrieve preferences');
    });
  });

  describe('POST /api/user/preferences/categories', () => {
    const createRequest = (body: unknown) => {
      return new NextRequest('http://localhost/api/user/preferences/categories', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    };

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = createRequest({ categoryIds: ['cat-1'] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should save user preferences', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ]);

      const request = createRequest({
        categoryIds: ['cat-1', 'cat-2'],
        filterEnabled: true,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.selectedCategories).toEqual(['cat-1', 'cat-2']);

      // Verify transaction was called
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prismaMock.userCategoryPreference.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', categoryId: 'cat-1', weight: 1 },
          { userId: 'user-1', categoryId: 'cat-2', weight: 1 },
        ],
      });
    });

    it('should remove duplicates from category IDs', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);

      const request = createRequest({
        categoryIds: ['cat-1', 'cat-1', 'cat-1'],
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-1']);
    });

    it('should reject invalid category IDs', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);

      const request = createRequest({
        categoryIds: ['cat-1', 'invalid-cat'],
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid category IDs');
      expect(data.invalidCategoryIds).toEqual(['invalid-cat']);
    });

    it('should reject when exceeding max selections', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const manyIds = Array.from({ length: 25 }, (_, i) => `cat-${i}`);
      const request = createRequest({ categoryIds: manyIds });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Maximum 20 categories allowed');
    });

    it('should reject non-array categoryIds', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({ categoryIds: 'not-an-array' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryIds must be an array');
    });

    it('should accept empty category array (clear all)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({ categoryIds: [] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.selectedCategories).toEqual([]);

      // Verify deleteMany was called but createMany was not (empty array)
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalled();
      expect(prismaMock.userCategoryPreference.createMany).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON body', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = new NextRequest(
        'http://localhost/api/user/preferences/categories',
        {
          method: 'POST',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should handle database errors', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      prismaMock.$transaction.mockRejectedValue(new Error('Database error'));

      const request = createRequest({ categoryIds: ['cat-1'] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save preferences');
    });
  });
});
