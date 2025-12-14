/**
 * APIレスポンスのZodスキーマ検証テスト
 *
 * このテストは app/history/page.tsx で使用されている
 * ArticleViewSchema/ArticleViewsResponseSchema が
 * 実際のAPIレスポンス形式と整合していることを検証する。
 */

import { z } from 'zod';

// app/history/page.tsx と同じスキーマ定義
// 注意: Prismaモデルは全てのIDに cuid() (String) を使用
const ArticleViewSchema = z.object({
  id: z.string(),           // Article.id: String @id @default(cuid())
  viewId: z.string(),       // ArticleView.id: String @id @default(cuid())
  title: z.string(),
  translatedTitle: z.string().nullable().optional(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string(),
  viewedAt: z.string().nullable(), // ArticleView.viewedAt: DateTime? (nullable)
  source: z.object({
    id: z.string(),         // Source.id: String @id @default(cuid())
    name: z.string(),
  }),
  companyName: z.string().nullable().optional(),
  tags: z
    .array(
      z.object({
        id: z.string(),     // Tag.id: String @id @default(cuid())
        name: z.string(),
      })
    )
    .optional(),
  contentLength: z.number().optional(),
  content: z.string().nullable().optional(),
});

const ArticleViewsResponseSchema = z.object({
  views: z.array(ArticleViewSchema),
});

describe('ArticleViewsResponseSchema', () => {
  describe('Valid responses', () => {
    it('should parse a valid response with all fields', () => {
      const validResponse = {
        views: [
          {
            id: 'cltest123abc',
            viewId: 'clview456def',
            title: 'Test Article',
            translatedTitle: 'テスト記事',
            summary: 'This is a test summary',
            url: 'https://example.com/article',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: '2025-12-14T09:30:00.000Z',
            source: {
              id: 'clsource789ghi',
              name: 'Zenn',
            },
            companyName: null,
            tags: [
              { id: 'cltag1', name: 'React' },
              { id: 'cltag2', name: 'TypeScript' },
            ],
            contentLength: 2500,
            content: 'Article content...',
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should parse response with minimal required fields', () => {
      const minimalResponse = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Minimal Article',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: {
              id: 'clsource789',
              name: 'Qiita',
            },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(minimalResponse);
      expect(result.success).toBe(true);
    });

    it('should parse empty views array', () => {
      const emptyResponse = { views: [] };
      const result = ArticleViewsResponseSchema.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });

    it('should parse response with null viewedAt', () => {
      const response = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null, // viewedAtはnullable
            source: { id: 'cls1', name: 'Test' },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid responses - ID type validation', () => {
    it('should reject response with numeric article id', () => {
      const invalidResponse = {
        views: [
          {
            id: 123, // ERROR: Should be string (cuid)
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: '2025-12-14T09:30:00.000Z',
            source: { id: 'cls1', name: 'Test' },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('id');
      }
    });

    it('should reject response with numeric viewId', () => {
      const invalidResponse = {
        views: [
          {
            id: 'cltest123',
            viewId: 456, // ERROR: Should be string (cuid)
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 'cls1', name: 'Test' },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('viewId');
      }
    });

    it('should reject response with numeric source id', () => {
      const invalidResponse = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 789, name: 'Test' }, // ERROR: Should be string
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject response with numeric tag id', () => {
      const invalidResponse = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 'cls1', name: 'Test' },
            tags: [{ id: 1, name: 'React' }], // ERROR: Should be string
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('Invalid responses - Missing required fields', () => {
    it('should reject response without views array', () => {
      const invalidResponse = {};
      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject view without id', () => {
      const invalidResponse = {
        views: [
          {
            // id missing
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 'cls1', name: 'Test' },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject view without viewId', () => {
      const invalidResponse = {
        views: [
          {
            id: 'cltest123',
            // viewId missing
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 'cls1', name: 'Test' },
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject view without source', () => {
      const invalidResponse = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            // source missing
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('Type coercion prevention', () => {
    it('should not coerce string to number for contentLength', () => {
      const response = {
        views: [
          {
            id: 'cltest123',
            viewId: 'clview456',
            title: 'Test',
            summary: null,
            url: 'https://example.com',
            publishedAt: '2025-12-14T10:00:00.000Z',
            viewedAt: null,
            source: { id: 'cls1', name: 'Test' },
            contentLength: '2500', // String instead of number
          },
        ],
      };

      const result = ArticleViewsResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});

describe('Schema matches Prisma model types', () => {
  /**
   * このテストは Prisma スキーマとの整合性を文書化する
   *
   * Prisma スキーマ (prisma/schema.prisma):
   * - Article.id: String @id @default(cuid())
   * - Source.id: String @id @default(cuid())
   * - Tag.id: String @id @default(cuid())
   * - ArticleView.id: String @id @default(cuid())
   * - ArticleView.viewedAt: DateTime? (nullable)
   */

  it('should document ID types match Prisma cuid() (String)', () => {
    // このテストは単に型の整合性を文書化するもの
    // ID型がnumberだった場合は上記のテストで検出される
    const sampleCuid = 'cltw7x8y90000tg0h5z6j3k2m';

    const validView = {
      id: sampleCuid,           // Article.id
      viewId: sampleCuid,       // ArticleView.id
      title: 'Test',
      summary: null,
      url: 'https://example.com',
      publishedAt: '2025-12-14T10:00:00.000Z',
      viewedAt: '2025-12-14T09:30:00.000Z',
      source: {
        id: sampleCuid,         // Source.id
        name: 'Test'
      },
      tags: [
        { id: sampleCuid, name: 'Test' }, // Tag.id
      ],
    };

    const result = ArticleViewSchema.safeParse(validView);
    expect(result.success).toBe(true);
  });

  it('should document viewedAt is nullable (DateTime?)', () => {
    const viewWithNullViewedAt = {
      id: 'cltest123',
      viewId: 'clview456',
      title: 'Test',
      summary: null,
      url: 'https://example.com',
      publishedAt: '2025-12-14T10:00:00.000Z',
      viewedAt: null, // DateTime? allows null
      source: { id: 'cls1', name: 'Test' },
    };

    const result = ArticleViewSchema.safeParse(viewWithNullViewedAt);
    expect(result.success).toBe(true);
  });
});
