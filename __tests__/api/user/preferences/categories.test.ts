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

const prismaMock = prisma as jest.Mocked<typeof prisma>;
const { resetPrismaMock } = require('@/lib/prisma') as {
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

// Mock digest service
jest.mock('@/lib/services/digest-service', () => ({
  digestService: {
    invalidateUserCache: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('User Category Preferences API', () => {
  beforeEach(() => {
    resetPrismaMock();
    jest.clearAllMocks();
  });

  describe('GET /api/user/preferences/categories', () => {
    const createGetRequest = (params?: Record<string, string>) => {
      const url = new URL('http://localhost/api/user/preferences/categories');
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
      }
      return new NextRequest(url.toString());
    };

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return user preferences', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
        { categoryId: 'cat-2' },
      ]);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-1', 'cat-2']);
      expect(data.filterEnabled).toBe(true);
      expect(data.periodMonths).toBe(12);
    });

    it('should return empty preferences for new users', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([]);

      const response = await GET(createGetRequest());
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

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to retrieve preferences');
    });

    it('should return home preferences when scope=home', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-1' },
      ]);

      const response = await GET(createGetRequest({ scope: 'home' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-1']);
      expect(data.scope).toBe('home');
      expect(prismaMock.userCategoryPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', scope: 'home' },
        })
      );
    });

    it('should return digest preferences when scope=digest', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([
        { categoryId: 'cat-3' },
      ]);

      const response = await GET(createGetRequest({ scope: 'digest' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-3']);
      expect(data.scope).toBe('digest');
      expect(prismaMock.userCategoryPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', scope: 'digest' },
        })
      );
    });

    it('should default to home scope when scope is not specified', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.userCategoryPreference.findMany.mockResolvedValue([]);

      const response = await GET(createGetRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.scope).toBe('home');
      expect(prismaMock.userCategoryPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', scope: 'home' },
        })
      );
    });

    it('should return 400 for invalid scope value', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const response = await GET(createGetRequest({ scope: 'invalid' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid scope parameter');
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

      // Verify transaction was called with default scope 'home'
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', scope: 'home' },
      });
      expect(prismaMock.userCategoryPreference.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', categoryId: 'cat-1', scope: 'home', weight: 1 },
          { userId: 'user-1', categoryId: 'cat-2', scope: 'home', weight: 1 },
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
      expect(data.error).toBe('categoryIds must be an array of strings');
    });

    it('should reject categoryIds with non-string elements', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({ categoryIds: ['valid-id', 123, null] });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryIds must be an array of strings');
    });

    it('should reject invalid periodMonths for home scope', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({
        categoryIds: ['cat-1'],
        periodMonths: 5,
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('periodMonths must be one of: 0, 3, 6, 12');
    });

    it('should reject non-number periodMonths for home scope', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({
        categoryIds: ['cat-1'],
        periodMonths: 'invalid',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('periodMonths must be one of: 0, 3, 6, 12');
    });

    it.each([0, 3, 6, 12])(
      'should accept valid periodMonths %i for home scope',
      async (validPeriod) => {
        mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
        prismaMock.interestCategory.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Test' },
        ]);
        prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
          if (typeof fn === 'function') {
            return fn(prismaMock);
          }
        });

        const request = createRequest({
          categoryIds: ['cat-1'],
          periodMonths: validPeriod,
        });
        const response = await POST(request);

        expect(response.status).toBe(200);
      }
    );

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

    it('should save home scope without affecting digest', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
      ]);

      const request = createRequest({
        categoryIds: ['cat-1'],
        scope: 'home',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // deleteMany should only target home scope
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', scope: 'home' },
      });
      // createMany should include home scope
      expect(prismaMock.userCategoryPreference.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', categoryId: 'cat-1', scope: 'home', weight: 1 },
        ],
      });
    });

    it('should save digest scope without affecting home', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-2' },
      ]);

      const request = createRequest({
        categoryIds: ['cat-2'],
        scope: 'digest',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // deleteMany should only target digest scope
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', scope: 'digest' },
      });
      // createMany should include digest scope
      expect(prismaMock.userCategoryPreference.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', categoryId: 'cat-2', scope: 'digest', weight: 1 },
        ],
      });
    });

    it('should not update periodMonths when scope is digest', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
      ]);

      const request = createRequest({
        categoryIds: ['cat-1'],
        scope: 'digest',
        periodMonths: 6,
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      // user.update should NOT be called for digest scope even if periodMonths is provided
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid scope in POST body', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const request = createRequest({
        categoryIds: ['cat-1'],
        scope: 'invalid',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid scope parameter');
    });
  });
});
