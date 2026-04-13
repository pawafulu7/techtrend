import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { PrismaClient } from '@/lib/prisma-exports';

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

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (value && typeof value === 'object' && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }

  return undefined;
};

const extractThresholdParam = (captured: unknown): number | undefined => {
  if (!Array.isArray(captured)) {
    return undefined;
  }

  const [rawStrings, ...interpolations] = captured;

  if (Array.isArray(rawStrings)) {
    let thresholdSegmentIndex = -1;

    for (let index = 0; index < rawStrings.length; index += 1) {
      const segment = rawStrings[index];
      if (typeof segment !== 'string' || !segment.includes('>= ')) {
        continue;
      }

      const previous = typeof rawStrings[index - 1] === 'string' ? rawStrings[index - 1] : '';
      const isThresholdSegment =
        segment.includes('::vector) >=') ||
        previous.includes('(e.embedding <=>') ||
        previous.includes('(e."embedding <=>');

      if (isThresholdSegment) {
        thresholdSegmentIndex = index;
        break;
      }
    }

    if (thresholdSegmentIndex >= 0) {
      const candidate = toNumber(interpolations[thresholdSegmentIndex]);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }

  // Fallback: deep traversal of the interpolations to locate last fractional value.
  const numbers: number[] = [];
  const stack: unknown[] = [interpolations];
  const seen = new Set<object>();

  while (stack.length > 0) {
    const current = stack.pop();

    if (current == null) {
      continue;
    }

    const numeric = toNumber(current);
    if (numeric !== undefined) {
      numbers.push(numeric);
      continue;
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }

    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (seen.has(obj)) {
        continue;
      }

      seen.add(obj);
      const values = Object.values(obj);
      for (let index = values.length - 1; index >= 0; index -= 1) {
        stack.push(values[index]);
      }
    }
  }

  for (let index = numbers.length - 1; index >= 0; index -= 1) {
    const candidate = numbers[index];
    if (candidate >= 0 && candidate <= 1) {
      return candidate;
    }
  }

  return undefined;
};

describe('VectorSearchService - Dynamic Threshold Integration', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;
  let service: VectorSearchService;
  let capturedSQL: any;
  let mockEmbeddingService: { embedText: jest.Mock };

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

    mockEmbeddingService = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    };

    // Create service instance
    service = new VectorSearchService(mockPrisma, mockEmbeddingService as any);
  });

  describe('Dynamic threshold selection', () => {
    it('should use dynamic threshold 0.5 for short query "CTO" when no explicit threshold provided', async () => {
      await service.search('CTO', {
        topK: 10,
        embeddingKey: 'summary',
      });

      // Verify $queryRaw was called
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = extractThresholdParam(capturedSQL);

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

      const thresholdParam = extractThresholdParam(capturedSQL);

      // Explicit threshold (0.9) should take precedence
      expect(thresholdParam).toBe(0.9);
    });

    it('should use dynamic threshold 0.6 for medium query "React hooks"', async () => {
      await service.search('React hooks', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = extractThresholdParam(capturedSQL);

      expect(thresholdParam).toBe(0.6);
    });

    it('should use dynamic threshold 0.65 for long query', async () => {
      await service.search('How to optimize React application performance', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = extractThresholdParam(capturedSQL);

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

      const thresholdParam = extractThresholdParam(capturedSQL);

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

      const thresholdParam = extractThresholdParam(capturedSQL);

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

      const thresholdParam = extractThresholdParam(capturedSQL);

      // Empty query should use default 0.5 from getDynamicThreshold
      expect(thresholdParam).toBe(0.5);
    });

    it('should handle whitespace-only query', async () => {
      await service.search('   ', {
        topK: 10,
        embeddingKey: 'summary',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();

      const thresholdParam = extractThresholdParam(capturedSQL);

      expect(thresholdParam).toBe(0.5);
    });
  });

  describe('Embedding service availability', () => {
    it('should throw when search is invoked without an embedding service', async () => {
      const serviceWithoutEmbedding = new VectorSearchService(mockPrisma, null);

      await expect(serviceWithoutEmbedding.search('query')).rejects.toThrow(
        'Vector search is unavailable because no EmbeddingService is configured'
      );
    });

    it('should return an empty array from searchByArticleId when embedding service is missing', async () => {
      const serviceWithoutEmbedding = new VectorSearchService(mockPrisma, null);

      const results = await serviceWithoutEmbedding.searchByArticleId('article-1');

      expect(results).toEqual([]);
    });
  });

  // Phase 2: searchByArticleId() tests
  describe('searchByArticleId', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      capturedSQL = [];
    });

    it('should search by article ID and return similar articles', async () => {
      const mockEmbedding = '[' + Array(1536).fill(0.1).join(',') + ']';
      const mockResults = [
        {
          articleId: 'article-2',
          title: 'Related Article',
          summary: 'Summary',
          translatedTitle: null,
          similarity: 0.75,
          publishedAt: new Date('2023-01-01'),
          sourceId: 'source-1',
          embeddingKey: 'summary',
          qualityScore: 80,
          sourceName: 'Test Source',
          tags: [{ id: 'tag-1', name: 'React' }],
          thumbnail: null,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValueOnce([{ embedding: mockEmbedding }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce(mockResults);

      const results = await service.searchByArticleId('article-1', {
        embeddingKey: 'summary',
        topK: 10,
        similarityThreshold: 0.5,
      });

      expect(results).toEqual(mockResults);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('should return empty array if no embedding found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const results = await service.searchByArticleId('article-without-embedding');

      expect(results).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
