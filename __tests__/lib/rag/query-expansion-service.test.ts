import { QueryExpansionService } from '@/lib/rag/query-expansion-service';

// Mock logger to avoid console noise
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  sanitizeError: jest.fn((err) => err),
}));

describe('QueryExpansionService', () => {
  let service: QueryExpansionService;

  beforeEach(() => {
    service = new QueryExpansionService();
    jest.clearAllMocks();
  });

  describe('Dictionary expansion', () => {
    it('should expand "CTO" using dictionary', async () => {
      const result = await service.expandQuery('CTO');

      expect(result.originalQuery).toBe('CTO');
      expect(result.expandedQuery).toBe('Chief Technology Officer');
      expect(result.method).toBe('dictionary');
      expect(result.cacheHit).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThan(100); // Should be very fast
    });

    it('should expand "SRE" using dictionary', async () => {
      const result = await service.expandQuery('SRE');

      expect(result.originalQuery).toBe('SRE');
      expect(result.expandedQuery).toBe('Site Reliability Engineering');
      expect(result.method).toBe('dictionary');
    });

    it('should expand multi-token queries', async () => {
      const result = await service.expandQuery('API design');

      expect(result.originalQuery).toBe('API design');
      expect(result.expandedQuery).toBe('API Application Programming Interface design');
      expect(result.method).toBe('dictionary');
    });

    it('should expand multiple abbreviations', async () => {
      const result = await service.expandQuery('SRE and DevOps');

      expect(result.originalQuery).toBe('SRE and DevOps');
      expect(result.expandedQuery).toBe('SRE Site Reliability Engineering and DevOps Development and Operations');
      expect(result.method).toBe('dictionary');
    });
  });

  describe('No expansion (unknown terms)', () => {
    it('should return "React" as-is', async () => {
      const result = await service.expandQuery('React');

      expect(result.originalQuery).toBe('React');
      expect(result.expandedQuery).toBe('React');
      expect(result.method).toBe('none');
    });

    it('should return "TypeScript hooks" as-is', async () => {
      const result = await service.expandQuery('TypeScript hooks');

      expect(result.originalQuery).toBe('TypeScript hooks');
      expect(result.expandedQuery).toBe('TypeScript hooks');
      expect(result.method).toBe('none');
    });

    it('should return long queries as-is', async () => {
      const longQuery = 'How to optimize React application performance';
      const result = await service.expandQuery(longQuery);

      expect(result.originalQuery).toBe(longQuery);
      expect(result.expandedQuery).toBe(longQuery);
      expect(result.method).toBe('none');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query', async () => {
      const result = await service.expandQuery('');

      expect(result.originalQuery).toBe('');
      expect(result.expandedQuery).toBe('');
      expect(result.method).toBe('none');
    });

    it('should handle whitespace-only query', async () => {
      const result = await service.expandQuery('   ');

      expect(result.originalQuery).toBe('');
      expect(result.expandedQuery).toBe('');
      expect(result.method).toBe('none');
    });

    it('should trim query before processing', async () => {
      const result = await service.expandQuery('  CTO  ');

      expect(result.originalQuery).toBe('CTO');
      expect(result.expandedQuery).toBe('Chief Technology Officer');
      expect(result.method).toBe('dictionary');
    });
  });

  describe('Performance', () => {
    it('should complete expansion in < 10ms', async () => {
      const start = Date.now();
      await service.expandQuery('CTO');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should report latency in result', async () => {
      const result = await service.expandQuery('CTO');

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.latencyMs).toBeLessThan(100);
    });
  });

  describe('Case sensitivity', () => {
    it('should handle lowercase abbreviations', async () => {
      const result = await service.expandQuery('cto');

      expect(result.expandedQuery).toBe('Chief Technology Officer');
    });

    it('should handle mixed case abbreviations', async () => {
      const result = await service.expandQuery('Cto');

      expect(result.expandedQuery).toBe('Chief Technology Officer');
    });

    it('should handle mixed case in multi-token queries', async () => {
      const result = await service.expandQuery('api Design');

      expect(result.expandedQuery).toBe('api Application Programming Interface Design');
    });
  });
});
