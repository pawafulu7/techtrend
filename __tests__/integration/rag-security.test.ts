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
import { Prisma, PrismaClient } from '@/lib/prisma-exports';
import { createPrismaClient } from '@/lib/prisma/create-client';
import { ZodError } from 'zod';

/** 入力の検証（Zod）で、指定した項目が理由で拒否されたことを確かめる。DB の障害など、ほかの失敗では通さない */
async function expectRejectedAt(promise: Promise<unknown>, field: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ZodError);
  expect((error as ZodError).issues.map((issue) => issue.path[0])).toContain(field);
}

describe('RAG Security - SQL Injection Prevention', () => {
  let searchService: VectorSearchService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();

    // 埋め込みの生成（OpenAI）は差し替えて渡す。渡さないと OPENAI_API_KEY の有無で EmbeddingService が
    // 無くなり、検索はどの入力でも「使えない」で失敗する（拒否を確かめるテストが、検証と関係なく通ってしまう）
    const mockEmbedding = Array.from({ length: 1536 }, () => 0.01);
    const embeddingService = {
      embedText: jest.fn().mockResolvedValue(mockEmbedding),
    } as unknown as EmbeddingService;
    searchService = new VectorSearchService(prisma, embeddingService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  /** 検索を実際の DB に流し、そのとき送った SQL（本文と値）を返す */
  async function captureSearchSql(options: { sourceIds?: string[]; tags?: string[] }) {
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw');
    try {
      await expect(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          ...options,
        })
      ).resolves.toEqual(expect.any(Array));
      expect(queryRawSpy).toHaveBeenCalledTimes(1);
      const [strings, ...values] = queryRawSpy.mock.calls[0] as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ];
      // 入れ子の Prisma.sql も展開して、本文と値に分ける
      return Prisma.sql(strings, ...values);
    } finally {
      queryRawSpy.mockRestore();
    }
  }

  describe('Parameter Sanitization', () => {
    it('should reject malicious embeddingKey (SQL injection attempt)', async () => {
      await expectRejectedAt(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          embeddingKey: "title'; DROP TABLE ArticleEmbedding; --" as any,
        }),
        'embeddingKey'
      );
    });

    it('should reject malicious sourceIds (SQL injection attempt)', async () => {
      const maliciousSourceIds = [
        "source1'; DROP TABLE Article; --",
        "source2",
      ];

      await expectRejectedAt(
        searchService.search('test query', {
          topK: 5,
          similarityThreshold: 0.5,
          sourceIds: maliciousSourceIds,
        }),
        'sourceIds'
      );
    });

    it('should pass malicious tags as SQL parameters, not SQL text', async () => {
      // タグは表示名（C++・Node.js・日本語など）なので形式では拒否せず、SQL の値として渡す
      const maliciousTags = ["tag1'; DELETE FROM Tag; --", 'tag2'];

      const sql = await captureSearchSql({ tags: maliciousTags });

      expect(sql.text).toMatch(/unnest\(\$\d+::text\[\]\)/);
      expect(sql.text).not.toContain(maliciousTags[0]);
      expect(sql.values).toContainEqual(maliciousTags);
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
    // 実際に DB へ送る SQL を見て、絞り込みの値が本文ではなくパラメータに入ることを確かめる
    it('should bind sourceIds and tags as parameters', async () => {
      const sourceIds = ['source_a', 'source-b'];
      const tags = ['React', 'C++'];

      const sql = await captureSearchSql({ sourceIds, tags });

      expect(sql.text).toMatch(/ANY\(\$\d+\)/);
      expect(sql.text).not.toContain('source_a');
      expect(sql.text).not.toContain('C++');
      expect(sql.values).toContainEqual(sourceIds);
      expect(sql.values).toContainEqual(tags);
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
