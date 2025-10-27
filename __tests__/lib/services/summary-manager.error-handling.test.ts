/**
 * SummaryManager Error Handling Regression Tests
 * Tests error scenarios and try/catch/finally paths
 */

import { PrismaClient } from '@prisma/client';
import { SummaryManager } from '@/lib/services/summary-manager';
import { UnifiedSummaryService } from '@/lib/ai/service/unified-summary-service';

// Mock dependencies
jest.mock('@/lib/di/bootstrap', () => ({
  getAppDependencies: jest.fn(() => ({
    service: mockSummaryService,
    translator: mockTranslator
  }))
}));

jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: {
    onBulkImport: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('@/scripts/utils/processing-status', () => ({
  getLastProcessedTime: jest.fn().mockResolvedValue(null),
  saveProcessingStatus: jest.fn().mockResolvedValue(undefined),
  hasContentUpdatesSince: jest.fn().mockResolvedValue(true),
  setPrisma: jest.fn()
}));

let mockSummaryService: any;
let mockTranslator: any;

describe('SummaryManager Error Handling', () => {
  let prisma: PrismaClient;
  let manager: SummaryManager;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock UnifiedSummaryService
    mockSummaryService = {
      generateSummary: jest.fn().mockResolvedValue({
        summary: 'Test summary',
        detailedSummary: 'Detailed test summary',
        tags: ['test', 'mock'],
        translatedTitle: 'Translated Title'
      })
    };

    // Mock Translator
    mockTranslator = {
      translateTitle: jest.fn().mockResolvedValue('Translated Title')
    };

    manager = new SummaryManager(prisma);
  });

  describe('API 503 error handling', () => {
    it('should track overload errors in stats', async () => {
      const error503 = new Error('503 Service overloaded');
      mockSummaryService.generateSummary.mockRejectedValue(error503);

      // Mock Prisma to return one article with content
      const mockPrismaWithArticle = {
        article: {
          findFirst: jest.fn().mockResolvedValue({ id: 'test-1' }),
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([{
            id: 'test-1',
            title: 'Test Article',
            url: 'https://example.com/test',
            content: 'This is test article content for summary generation.',
            publishedAt: new Date(),
            source: { id: 'src-1', name: 'Test Source' }
          }]),
          update: jest.fn().mockResolvedValue({})
        },
        source: {
          findMany: jest.fn().mockResolvedValue([])
        },
        $disconnect: jest.fn().mockResolvedValue(undefined)
      } as any;

      const testManager = new SummaryManager(mockPrismaWithArticle);
      const result = await testManager.generateSummaries({ limit: 1 });

      const stats = testManager.getStats();
      expect(stats.failures).toBeGreaterThan(0);
      expect(result.errors).toBeGreaterThan(0);
    });
  });

  describe('Prisma error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock Prisma to throw error
      const mockFailingPrisma = {
        article: {
          findFirst: jest.fn().mockRejectedValue(new Error('Database connection failed'))
        },
        source: {
          findMany: jest.fn().mockResolvedValue([])
        },
        $disconnect: jest.fn().mockResolvedValue(undefined)
      } as any;

      const failingManager = new SummaryManager(mockFailingPrisma);

      await expect(failingManager.generateSummaries({ limit: 1 })).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('stats reset', () => {
    it('should reset stats after multiple operations', () => {
      // Simulate some stats
      manager.resetStats();

      const stats = manager.getStats();
      expect(stats.attempts).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.overloadErrors).toBe(0);
    });

    it('should maintain independent stats across instances', () => {
      const manager1 = new SummaryManager(prisma);
      const manager2 = new SummaryManager(prisma);

      // Get initial stats for manager2
      const stats2Before = manager2.getStats();
      const attempts2Before = stats2Before.attempts;

      // Reset manager1's stats
      manager1.resetStats();
      const stats1After = manager1.getStats();

      // Get manager2's stats after manager1 reset
      const stats2After = manager2.getStats();

      // manager1 should be reset
      expect(stats1After.attempts).toBe(0);
      expect(stats1After.successes).toBe(0);
      expect(stats1After.failures).toBe(0);

      // manager2 should be unaffected by manager1's reset
      expect(stats2After.attempts).toBe(attempts2Before);
    });
  });
});
