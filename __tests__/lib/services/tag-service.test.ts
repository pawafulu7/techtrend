/**
 * TagService Tests
 *
 * Tests for safe tag creation/retrieval operations
 */

// Define mock implementations before jest.mock calls
const mockTransaction = jest.fn();
const mockUpsert = jest.fn();

// Mock PrismaClient - must be before any imports that use it
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => ({
      tag: {
        upsert: mockUpsert,
      },
      $transaction: mockTransaction,
    })),
  };
});

// Mock TagNormalizer
jest.mock('@/lib/services/tag-normalizer', () => ({
  TagNormalizer: {
    normalizeTags: (tags: string[]) => {
      // Simple normalization: lowercase and deduplicate
      const seen = new Set<string>();
      return tags
        .map((t) => t.toLowerCase().trim())
        .filter((t) => {
          if (!t || seen.has(t)) return false;
          seen.add(t);
          return true;
        })
        .map((name) => ({ name }));
    },
    normalize: (tag: string) => ({ name: tag.toLowerCase().trim() }),
    inferCategory: () => null,
  },
}));

describe('TagService', () => {
  // Import inside describe to ensure mocks are set up first
  let getOrCreateTags: typeof import('@/lib/services/tag-service').getOrCreateTags;
  let getTagIdsForConnect: typeof import('@/lib/services/tag-service').getTagIdsForConnect;
  let normalizeTagNames: typeof import('@/lib/services/tag-service').normalizeTagNames;

  beforeAll(async () => {
    const module = await import('@/lib/services/tag-service');
    getOrCreateTags = module.getOrCreateTags;
    getTagIdsForConnect = module.getTagIdsForConnect;
    normalizeTagNames = module.normalizeTagNames;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateTags', () => {
    it('should return empty array for empty input', async () => {
      const result = await getOrCreateTags([]);
      expect(result).toEqual([]);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should return empty array for null/undefined input', async () => {
      const result = await getOrCreateTags(null as unknown as string[]);
      expect(result).toEqual([]);
    });

    it('should call transaction with upserts for each normalized tag name', async () => {
      const mockTags = [
        { id: '1', name: 'javascript', category: null },
        { id: '2', name: 'typescript', category: null },
      ];

      mockTransaction.mockResolvedValueOnce(mockTags);

      const result = await getOrCreateTags(['JavaScript', 'TypeScript']);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTags);
    });

    it('should deduplicate tag names through normalization', async () => {
      const mockTags = [{ id: '1', name: 'javascript', category: null }];

      mockTransaction.mockResolvedValueOnce(mockTags);

      await getOrCreateTags(['JavaScript', 'javascript', 'JAVASCRIPT']);

      // Should only create one tag due to normalization
      const transactionCall = mockTransaction.mock.calls[0][0];
      expect(transactionCall.length).toBe(1);
    });

    it('should limit number of tags to maxTags option', async () => {
      const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
      const mockTags = manyTags.slice(0, 5).map((name, i) => ({
        id: String(i),
        name,
        category: null,
      }));

      mockTransaction.mockResolvedValueOnce(mockTags);

      await getOrCreateTags(manyTags, { maxTags: 5 });

      const transactionCall = mockTransaction.mock.calls[0][0];
      expect(transactionCall.length).toBe(5);
    });

    it('should skip normalization when normalize option is false', async () => {
      const mockTags = [
        { id: '1', name: 'custom-tag', category: null },
        { id: '2', name: 'CUSTOM-TAG-2', category: null },
      ];

      mockTransaction.mockResolvedValueOnce(mockTags);

      await getOrCreateTags(['custom-tag', 'CUSTOM-TAG-2'], {
        normalize: false,
      });

      // Both tags should be processed (not merged by normalization)
      const transactionCall = mockTransaction.mock.calls[0][0];
      expect(transactionCall.length).toBe(2);
    });
  });

  describe('getTagIdsForConnect', () => {
    it('should return array of tag IDs', async () => {
      const mockTags = [
        { id: 'abc123', name: 'javascript', category: null },
        { id: 'def456', name: 'typescript', category: null },
      ];

      mockTransaction.mockResolvedValueOnce(mockTags);

      const result = await getTagIdsForConnect(['javascript', 'typescript']);

      expect(result).toEqual([{ id: 'abc123' }, { id: 'def456' }]);
    });

    it('should return empty array for empty input', async () => {
      const result = await getTagIdsForConnect([]);
      expect(result).toEqual([]);
    });
  });

  describe('normalizeTagNames', () => {
    it('should normalize and deduplicate tag names', () => {
      const result = normalizeTagNames([
        'JavaScript',
        'javascript',
        'JAVASCRIPT',
      ]);

      // Should deduplicate to single tag
      expect(result.length).toBe(1);
      expect(result).toContain('javascript');
    });

    it('should return empty array for empty input', () => {
      const result = normalizeTagNames([]);
      expect(result).toEqual([]);
    });
  });

  describe('concurrent tag creation', () => {
    it('should handle concurrent calls returning consistent results', async () => {
      // Simulate multiple concurrent calls returning same tag
      const mockTag = { id: 'same-id', name: 'concurrenttag', category: null };

      mockTransaction.mockResolvedValue([mockTag]);

      // Simulate concurrent requests
      const results = await Promise.all([
        getOrCreateTags(['ConcurrentTag']),
        getOrCreateTags(['ConcurrentTag']),
        getOrCreateTags(['ConcurrentTag']),
      ]);

      // All should return the same tag
      expect(results[0][0].id).toBe('same-id');
      expect(results[1][0].id).toBe('same-id');
      expect(results[2][0].id).toBe('same-id');
    });
  });
});
