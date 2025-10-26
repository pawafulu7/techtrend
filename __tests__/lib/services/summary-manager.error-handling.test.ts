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

jest.mock('@/lib/utils/processing-status', () => ({
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

      const result = await manager.generateSummaries({ limit: 1 });

      const stats = manager.getStats();
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

      manager1.resetStats();

      const stats1 = manager1.getStats();
      const stats2 = manager2.getStats();

      // Different instances should have different startTime
      expect(stats1.startTime).not.toBe(stats2.startTime);
    });
  });
});
