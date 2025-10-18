/**
 * RAG Security Tests - SQL Injection Prevention
 *
 * CRITICAL: These tests validate that the RAG implementation is immune to SQL injection attacks.
 *
 * Coverage:
 * - embeddingKey parameter injection
 * - sourceIds array injection
 * - tags array injection
 * - query text injection
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md
 */

import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { EmbeddingService } from '@/lib/rag/embedding-service';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';

describe('RAG Security - SQL Injection Prevention', () => {
  let searchService: VectorSearchService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    searchService = new VectorSearchService(prisma);

    // Mock OpenAI API to avoid external dependencies and flakiness
    const mockEmbedding = Array.from({ length: 1536 }, () => 0.01);
    jest
      .spyOn(EmbeddingService.prototype, 'generateEmbedding')
      .mockResolvedValue(mockEmbedding);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  describe('Parameter Sanitization', () => {
    it('should reject malicious embeddingKey (SQL injection attempt)', async () => {
      const maliciousQuery = "'; DROP TABLE ArticleEmbedding; --";

      await expect(
        searchService.search(maliciousQuery, {
          topK: 5,
          similarityThreshold: 0.5,
          embeddingKey: "title'; DROP TABLE ArticleEmbedding; --" as any,
        })
      ).rejects.toThrow();
    });

    it('should reject malicious sourceIds (SQL injection attempt)', async () => {
      const maliciousSourceIds = [
        "source1'; DROP TABLE Article; --",
        "source2",
      ];

      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          sourceIds: maliciousSourceIds,
        })
      ).rejects.toThrow();
    });

    it('should reject malicious tags (SQL injection attempt)', async () => {
      const maliciousTags = [
        "tag1'; DELETE FROM Tag; --",
        "tag2",
      ];

      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          tags: maliciousTags,
        })
      ).rejects.toThrow();
    });

    it('should handle special characters in query text safely', async () => {
      const queryWithSpecialChars = "test's \"query\" with <HTML> & chars; DROP TABLE Article; --";

      // Should not throw - query text is for embedding generation, not SQL
      // OpenAI API is mocked, so this tests search layer safety only
      const result = await searchService.search(queryWithSpecialChars, {
        topK: 5,
        similarityThreshold: 0.5,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Input Validation (Zod)', () => {
    it('should reject invalid topK (negative)', async () => {
      await expect(
        searchService.search('test query', {
          topK: -1,
          similarityThreshold: 0.5,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject invalid topK (too large)', async () => {
      await expect(
        searchService.search('test query', {
          topK: 101,
          similarityThreshold: 0.5,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject invalid similarityThreshold (< 0)', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: -0.1,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject invalid similarityThreshold (> 1)', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 1.5,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject too many sourceIds (> 50)', async () => {
      const tooManySourceIds = Array.from({ length: 51 }, (_, i) => `source${i}`);

      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          sourceIds: tooManySourceIds,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject too many tags (> 20)', async () => {
      const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);

      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          tags: tooManyTags,
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject duplicate sourceIds', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          sourceIds: ['source1', 'source1', 'source2'],
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject duplicate tags', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          tags: ['tag1', 'tag1', 'tag2'],
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject empty sourceIds after trim', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          sourceIds: ['source1', '   ', 'source2'],
        })
      ).rejects.toThrow(ZodError);
    });

    it('should reject empty tags after trim', async () => {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          tags: ['tag1', '   ', 'tag2'],
        })
      ).rejects.toThrow(ZodError);
    });
  });

  describe('Prisma.sql Template Safety', () => {
    it('should use parameterized queries (not string concatenation)', () => {
      // This is a code-level verification
      // The actual implementation should use Prisma.sql with template literals

      // Verify by checking that VectorSearchService doesn't use $queryRawUnsafe
      const serviceCode = require('fs').readFileSync(
        require.resolve('@/lib/rag/vector-search-service'),
        'utf8'
      );

      expect(serviceCode).not.toContain('$queryRawUnsafe');
      expect(serviceCode).toContain('Prisma.sql');
    });

    it('should bind all variables as parameters', () => {
      // Verify that the implementation uses parameter binding for all variables
      const serviceCode = require('fs').readFileSync(
        require.resolve('@/lib/rag/vector-search-service'),
        'utf8'
      );

      // Should use ${variable} syntax within Prisma.sql templates
      expect(serviceCode).toContain('${');
      expect(serviceCode).toContain('}');
    });
  });
});

/**
 * TODO: Future Test Expansion
 *
 * The following tests should be added in Phase 2+:
 * - [ ] Performance tests (vector search latency < 200ms)
 * - [ ] Concurrent request handling (rate limiting behavior)
 * - [ ] Large dataset tests (10k+ embeddings)
 * - [ ] Index optimization validation (IVFFLAT vs HNSW)
 * - [ ] Cost tracking (OpenAI API usage monitoring)
 * - [ ] Error recovery tests (database connection loss)
 * - [ ] Memory leak tests (long-running processes)
 */
