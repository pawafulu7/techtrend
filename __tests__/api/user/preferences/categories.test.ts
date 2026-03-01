/**
 * User Category Preferences API Tests
 */

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: Function) => handler),
}));
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: Function) => handler),
}));
jest.mock('@/lib/middleware/with-user-validation', () => ({
  withUserValidation: jest.fn((handler: Function) => handler),
  validateUser: jest.fn(),
  createUserDeletedResponse: jest.fn(),
}));

const getMiddlewareMocks = () => {
  const { withRateLimit } = jest.requireMock('@/lib/middleware/with-rate-limit') as {
    withRateLimit: jest.MockedFunction<(key: string, handler: Function) => Function>;
  };
  const { withCSRFProtection } = jest.requireMock('@/lib/middleware/csrf-protection') as {
    withCSRFProtection: jest.MockedFunction<(handler: Function) => Function>;
  };
  const { withUserValidation, validateUser, createUserDeletedResponse } =
    jest.requireMock('@/lib/middleware/with-user-validation') as {
      withUserValidation: jest.MockedFunction<(handler: Function) => Function>;
      validateUser: jest.Mock;
      createUserDeletedResponse: jest.Mock;
    };
  return { withRateLimit, withCSRFProtection, withUserValidation, validateUser, createUserDeletedResponse };
};

import { GET, POST } from '@/app/api/user/preferences/categories/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Snapshot middleware composition calls immediately after import
// (before any clearAllMocks in beforeEach can erase them)
const middlewareCompositionSnapshot = (() => {
  const { withRateLimit, withCSRFProtection, withUserValidation } = getMiddlewareMocks();
  return {
    rateLimitKey: withRateLimit.mock.calls[0]?.[0] as string | undefined,
    rateLimitCalled: withRateLimit.mock.calls.length > 0,
    userValidationCalled: withUserValidation.mock.calls.length > 0,
    csrfProtectionCalled: withCSRFProtection.mock.calls.length > 0,
  };
})();

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
    // Default: validateUser returns a valid user (used by GET handler)
    getMiddlewareMocks().validateUser.mockResolvedValue({ id: 'user-1', deletedAt: null });
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

    it('should return 400 for empty string scope', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

      const response = await GET(createGetRequest({ scope: '' }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid scope parameter');
    });
  });

  describe('POST /api/user/preferences/categories', () => {
    const mockContext = {
      session: { user: { id: 'user-1' } },
      validatedUser: { id: 'user-1', deletedAt: null },
    };

    const createRequest = (body: unknown) => {
      return new NextRequest('http://localhost/api/user/preferences/categories', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const callPost = (body: unknown) => {
      const request = createRequest(body);
      return POST(request, mockContext as any);
    };

    it('should be wrapped with correct middleware chain', () => {
      expect(middlewareCompositionSnapshot.rateLimitCalled).toBe(true);
      expect(middlewareCompositionSnapshot.rateLimitKey).toBe('write:preferences');
      expect(middlewareCompositionSnapshot.userValidationCalled).toBe(true);
      expect(middlewareCompositionSnapshot.csrfProtectionCalled).toBe(true);
    });

    it('should save user preferences', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ]);

      const response = await callPost({
        categoryIds: ['cat-1', 'cat-2'],
        filterEnabled: true,
      });
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
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);

      const response = await callPost({
        categoryIds: ['cat-1', 'cat-1', 'cat-1'],
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.selectedCategories).toEqual(['cat-1']);
    });

    it('should reject invalid category IDs', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);

      const response = await callPost({
        categoryIds: ['cat-1', 'invalid-cat'],
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid category IDs');
      expect(data.invalidCategoryIds).toEqual(['invalid-cat']);
    });

    it('should reject when exceeding max selections', async () => {
      const manyIds = Array.from({ length: 25 }, (_, i) => `cat-${i}`);
      const response = await callPost({ categoryIds: manyIds });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Maximum 20 categories allowed');
    });

    it('should reject non-array categoryIds', async () => {
      const response = await callPost({ categoryIds: 'not-an-array' });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryIds must be an array of strings');
    });

    it('should reject categoryIds with non-string elements', async () => {
      const response = await callPost({ categoryIds: ['valid-id', 123, null] });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('categoryIds must be an array of strings');
    });

    it('should reject invalid periodMonths for home scope', async () => {
      const response = await callPost({
        categoryIds: ['cat-1'],
        periodMonths: 5,
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('periodMonths must be one of: 0, 3, 6, 12');
    });

    it('should reject non-number periodMonths for home scope', async () => {
      const response = await callPost({
        categoryIds: ['cat-1'],
        periodMonths: 'invalid',
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('periodMonths must be one of: 0, 3, 6, 12');
    });

    it.each([0, 3, 6, 12])(
      'should accept valid periodMonths %i for home scope',
      async (validPeriod) => {
        prismaMock.interestCategory.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Test' },
        ]);
        prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
          if (typeof fn === 'function') {
            return fn(prismaMock);
          }
        });

        const response = await callPost({
          categoryIds: ['cat-1'],
          periodMonths: validPeriod,
        });

        expect(response.status).toBe(200);

        // Verify user.update was called with the correct periodMonths
        expect(prismaMock.user.update).toHaveBeenCalledWith({
          where: { id: 'user-1' },
          data: { personalizationPeriodMonths: validPeriod },
        });
      }
    );

    it('should accept empty category array (clear all)', async () => {
      const response = await callPost({ categoryIds: [] });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.selectedCategories).toEqual([]);

      // Verify deleteMany was called but createMany was not (empty array)
      expect(prismaMock.userCategoryPreference.deleteMany).toHaveBeenCalled();
      expect(prismaMock.userCategoryPreference.createMany).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest(
        'http://localhost/api/user/preferences/categories',
        {
          method: 'POST',
          body: 'invalid json',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const response = await POST(request, mockContext as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should handle database errors', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      prismaMock.$transaction.mockRejectedValue(new Error('Database error'));

      const response = await callPost({ categoryIds: ['cat-1'] });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save preferences');
    });

    it('should save home scope without affecting digest', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
      ]);

      const response = await callPost({
        categoryIds: ['cat-1'],
        scope: 'home',
      });
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

      // digest cache should NOT be invalidated for home scope
      const { digestService } = require('@/lib/services/digest-service');
      expect(digestService.invalidateUserCache).not.toHaveBeenCalled();
    });

    it('should save digest scope without affecting home', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-2' },
      ]);

      const response = await callPost({
        categoryIds: ['cat-2'],
        scope: 'digest',
      });
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

      // digest cache should be invalidated for digest scope
      const { digestService } = require('@/lib/services/digest-service');
      expect(digestService.invalidateUserCache).toHaveBeenCalledWith('user-1');
    });

    it('should not update periodMonths when scope is digest', async () => {
      prismaMock.interestCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
      ]);

      const response = await callPost({
        categoryIds: ['cat-1'],
        scope: 'digest',
        periodMonths: 6,
      });

      expect(response.status).toBe(200);

      // user.update should NOT be called for digest scope even if periodMonths is provided
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid scope in POST body', async () => {
      const response = await callPost({
        categoryIds: ['cat-1'],
        scope: 'invalid',
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid scope parameter');
    });

    it('should return 400 for empty string scope in POST body', async () => {
      const response = await callPost({
        categoryIds: ['cat-1'],
        scope: '',
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid scope parameter');
    });
  });
});
