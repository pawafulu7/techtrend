import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { PrismaClient } from '@prisma/client';

// Mock dependencies
jest.mock('@/lib/rag/embedding-service');
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeError: jest.fn((err) => err),
}));

describe('VectorSearchService - Dynamic Threshold Integration', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let service: VectorSearchService;
  let capturedSQL: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock Prisma client
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as any;

    // Capture SQL queries
    mockPrisma.$queryRaw = jest.fn().mockImplementation((...args) => {
      capturedSQL = args;
      return Promise.resolve([]);
    });

    // Mock EmbeddingService
    const { EmbeddingService } = require('@/lib/rag/embedding-service');
    EmbeddingService.prototype.embedText = jest.fn().mockResolvedValue(
      // Return deterministic 1536-dimensional vector (all 0.1)
      new Array(1536).fill(0.1)
    );

    // Create service instance
    service = new VectorSearchService(mockPrisma);
  });

  describe('Dynamic threshold selection', () => {
    it('should use dynamic threshold 0.5 for short query "CTO" when no explicit threshold provided', async () => {
      await service.search('CTO', {
        topK: 10,
        embeddingKey: 'summary',
      });

      // Verify $queryRaw was called
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      // Extract SQL query (first argument is the template strings array)
      const sqlTemplate = capturedSQL[0];
      const sqlString = Array.isArray(sqlTemplate)
        ? sqlTemplate.join('')
        : String(sqlTemplate);

      // Check that the SQL contains the dynamic threshold (0.5 for "CTO")
      // The SQL should have: >= ${effectiveThreshold}
      // We need to check the bound parameter values
      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      expect(thresholdParam).toBe(0.5);
    });

    it('should use explicit threshold when provided, ignoring dynamic threshold', async () => {
      await service.search('CTO', {
        topK: 10,
        similarityThreshold: 0.9,
        embeddingKey: 'summary',
      });

      // Verify $queryRaw was called
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      // Find threshold parameter in captured SQL
      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      // Explicit threshold (0.9) should take precedence
      expect(thresholdParam).toBe(0.9);
    });

    it('should use dynamic threshold 0.6 for medium query "React hooks"', async () => {
      await service.search('React hooks', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      expect(thresholdParam).toBe(0.6);
    });

    it('should use dynamic threshold 0.65 for long query', async () => {
      await service.search('How to optimize React application performance', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      expect(thresholdParam).toBe(0.65);
    });
  });

  describe('Backward compatibility', () => {
    it('should respect explicit threshold 0.4 (agent search use case)', async () => {
      await service.search('CTO', {
        topK: 10,
        similarityThreshold: 0.4,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      // Agent search uses 0.4-0.55 range, should be preserved
      expect(thresholdParam).toBe(0.4);
    });

    it('should handle default threshold from schema when no explicit value', async () => {
      // When similarityThreshold is undefined (not provided in options)
      // The schema will provide default 0.5, but getDynamicThreshold should override it
      await service.search('TypeScript tutorial', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      // Dynamic threshold for 2-token query should be 0.6
      expect(thresholdParam).toBe(0.6);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query', async () => {
      await service.search('', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      // Empty query should use default 0.5 from getDynamicThreshold
      expect(thresholdParam).toBe(0.5);
    });

    it('should handle whitespace-only query', async () => {
      await service.search('   ', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = capturedSQL.find((arg: any) =>
        typeof arg === 'number' && arg >= 0 && arg <= 1
      );

      expect(thresholdParam).toBe(0.5);
    });
  });
});
