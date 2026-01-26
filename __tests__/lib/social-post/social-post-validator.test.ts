import { describe, it, expect } from '@jest/globals';
import {
  SocialPostCreateSchema,
  SocialPostUpdateSchema,
  SocialPostGenerateSchema,
  SocialPostAutoGenerateSchema,
  SocialPostBulkSchema,
  SocialPostFiltersSchema,
  validateGeneratedContent,
  ArticleCandidatesSearchSchema,
  ARTICLE_CATEGORIES,
} from '@/lib/social-post/social-post-validator';
import { ArticleCategory } from '@prisma/client';

describe('SocialPostValidator', () => {
  describe('SocialPostCreateSchema', () => {
    it('should validate valid create input', () => {
      const validInput = {
        content: 'This is a test post about TypeScript',
        hashtags: ['#TypeScript', '#Programming'],
        sourceUrls: ['https://example.com/article'],
        source: 'ARTICLE',
        sourceIds: ['article-123'],
      };

      const result = SocialPostCreateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const invalidInput = {
        content: '',
        hashtags: ['#Test'],
        sourceUrls: ['https://example.com'],
        source: 'ARTICLE',
        sourceIds: ['article-1'],
      };

      const result = SocialPostCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject content exceeding 280 characters', () => {
      const invalidInput = {
        content: 'a'.repeat(281),
        hashtags: ['#Test'],
        sourceUrls: ['https://example.com'],
        source: 'ARTICLE',
        sourceIds: ['article-1'],
      };

      const result = SocialPostCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid source type', () => {
      const invalidInput = {
        content: 'Test content',
        hashtags: ['#Test'],
        sourceUrls: ['https://example.com'],
        source: 'INVALID_SOURCE',
      };

      const result = SocialPostCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should accept all valid source types', () => {
      const validSources = ['ARTICLE', 'DAILY_TREND', 'DIFF_SUMMARY', 'MANUAL'];

      validSources.forEach((source) => {
        const input = {
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: ['https://example.com'],
          source,
          // non-MANUALソースにはsourceIdsが必須
          ...(source !== 'MANUAL' && { sourceIds: ['source-1'] }),
        };

        const result = SocialPostCreateSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid URLs in sourceUrls', () => {
      const invalidInput = {
        content: 'Test content',
        hashtags: ['#Test'],
        sourceUrls: ['not-a-valid-url'],
        source: 'ARTICLE',
        sourceIds: ['article-1'],
      };

      const result = SocialPostCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject non-http/https URLs (javascript:, data:)', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      dangerousUrls.forEach((url) => {
        const invalidInput = {
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: [url],
          source: 'ARTICLE',
          sourceIds: ['article-1'],
        };

        const result = SocialPostCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    it('should accept valid http/https URLs', () => {
      const validUrls = [
        'https://example.com/article',
        'http://localhost:3000/test',
        'https://github.com/user/repo',
      ];

      validUrls.forEach((url) => {
        const validInput = {
          content: 'Test content',
          hashtags: ['#Test'],
          sourceUrls: [url],
          source: 'ARTICLE',
          sourceIds: ['article-1'],
        };

        const result = SocialPostCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('SocialPostUpdateSchema', () => {
    it('should validate partial update with content only', () => {
      const validInput = {
        content: 'Updated content',
      };

      const result = SocialPostUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate status change', () => {
      const validInput = {
        status: 'REVIEWED',
      };

      const result = SocialPostUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept all valid status types for update', () => {
      // Update schema only allows these statuses (not POSTING, POSTED, FAILED - those are system-managed)
      const validStatuses = ['DRAFT', 'REVIEWED', 'SCHEDULED', 'ARCHIVED'];

      validStatuses.forEach((status) => {
        // SCHEDULED requires scheduledAt
        const input =
          status === 'SCHEDULED'
            ? { status, scheduledAt: '2024-12-25T10:00:00.000Z' }
            : { status };
        const result = SocialPostUpdateSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it('should reject system-managed status types', () => {
      // These statuses are managed by the system, not user input
      const systemStatuses = ['POSTING', 'POSTED', 'FAILED'];

      systemStatuses.forEach((status) => {
        const result = SocialPostUpdateSchema.safeParse({ status });
        expect(result.success).toBe(false);
      });
    });

    it('should reject SCHEDULED without scheduledAt', () => {
      const result = SocialPostUpdateSchema.safeParse({ status: 'SCHEDULED' });
      expect(result.success).toBe(false);
    });

    it('should validate scheduledAt as ISO string', () => {
      const validInput = {
        scheduledAt: '2024-12-25T10:00:00.000Z',
      };

      const result = SocialPostUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should allow null for scheduledAt', () => {
      const validInput = {
        scheduledAt: null,
      };

      const result = SocialPostUpdateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const invalidInput = {
        status: 'INVALID_STATUS',
      };

      const result = SocialPostUpdateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('SocialPostGenerateSchema', () => {
    it('should validate valid generate request', () => {
      const validInput = {
        source: 'ARTICLE',
        sourceIds: ['article-1', 'article-2'],
      };

      const result = SocialPostGenerateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject more than 5 sourceIds', () => {
      const invalidInput = {
        source: 'ARTICLE',
        sourceIds: ['1', '2', '3', '4', '5', '6'],
      };

      const result = SocialPostGenerateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty sourceIds', () => {
      const invalidInput = {
        source: 'ARTICLE',
        sourceIds: [],
      };

      const result = SocialPostGenerateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject MANUAL as generate source', () => {
      const invalidInput = {
        source: 'MANUAL',
        sourceIds: ['1'],
      };

      const result = SocialPostGenerateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('SocialPostAutoGenerateSchema', () => {
    it('should validate valid count', () => {
      const validInput = { count: 3 };
      const result = SocialPostAutoGenerateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(3);
      }
    });

    it('should use default count of 3 when not provided', () => {
      const result = SocialPostAutoGenerateSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(3);
      }
    });

    it('should coerce string count to number', () => {
      const result = SocialPostAutoGenerateSchema.safeParse({ count: '5' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(5);
      }
    });

    it('should reject count less than 1', () => {
      const result = SocialPostAutoGenerateSchema.safeParse({ count: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject count greater than 5', () => {
      const result = SocialPostAutoGenerateSchema.safeParse({ count: 6 });
      expect(result.success).toBe(false);
    });

    it('should accept boundary values (1 and 5)', () => {
      const result1 = SocialPostAutoGenerateSchema.safeParse({ count: 1 });
      expect(result1.success).toBe(true);

      const result5 = SocialPostAutoGenerateSchema.safeParse({ count: 5 });
      expect(result5.success).toBe(true);
    });
  });

  describe('SocialPostBulkSchema', () => {
    it('should validate delete action', () => {
      const validInput = {
        action: 'delete',
        ids: ['id-1', 'id-2'],
      };

      const result = SocialPostBulkSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate changeStatus action with status', () => {
      const validInput = {
        action: 'changeStatus',
        ids: ['id-1'],
        status: 'REVIEWED',
      };

      const result = SocialPostBulkSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject more than 50 ids', () => {
      const invalidInput = {
        action: 'delete',
        ids: Array.from({ length: 51 }, (_, i) => `id-${i}`),
      };

      const result = SocialPostBulkSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty ids array', () => {
      const invalidInput = {
        action: 'delete',
        ids: [],
      };

      const result = SocialPostBulkSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid action', () => {
      const invalidInput = {
        action: 'invalidAction',
        ids: ['id-1'],
      };

      const result = SocialPostBulkSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('SocialPostFiltersSchema', () => {
    it('should validate empty filters', () => {
      const result = SocialPostFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should apply default values for page and limit', () => {
      const result = SocialPostFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should validate status filter', () => {
      const validInput = {
        status: 'DRAFT',
      };

      const result = SocialPostFiltersSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate source filter', () => {
      const validInput = {
        source: 'ARTICLE',
      };

      const result = SocialPostFiltersSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate date range filters with ISO datetime', () => {
      const validInput = {
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-12-31T23:59:59.999Z',
      };

      const result = SocialPostFiltersSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const invalidInput = {
        dateFrom: '2024-01-01', // Not ISO datetime format
      };

      const result = SocialPostFiltersSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should coerce string page and limit to numbers', () => {
      const validInput = {
        page: '2',
        limit: '50',
      };

      const result = SocialPostFiltersSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it('should reject limit over 100', () => {
      const invalidInput = {
        limit: '200',
      };

      const result = SocialPostFiltersSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should accept limit at 100', () => {
      const validInput = {
        limit: '100',
      };

      const result = SocialPostFiltersSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });
  });

  describe('validateGeneratedContent', () => {
    it('should accept valid content', () => {
      const validContent =
        'This is a great article about TypeScript features and best practices.';

      const result = validateGeneratedContent(validContent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject content with forbidden patterns', () => {
      // These are the actual forbidden patterns in the implementation
      const forbiddenPatterns = [
        // 宣伝調
        '注目',
        '革新的',
        '画期的',
        '必見',
        '話題',
        'すごい',
        'やばい',
        '最高',
        '超おすすめ',
        // 評論調
        '興味深い',
        '素晴らしい',
      ];

      forbiddenPatterns.forEach((pattern) => {
        const content = `これは${pattern}な記事です。詳細を見てみましょう。`;
        const result = validateGeneratedContent(content);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Forbidden'))).toBe(true);
      });
    });

    it('should reject content with commentary-style endings', () => {
      const commentaryEndings = [
        'これは良い取り組みですね。',
        '今後の展開に期待です。',
        '素晴らしい機能ですよね',
      ];

      commentaryEndings.forEach((content) => {
        const result = validateGeneratedContent(content);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Forbidden'))).toBe(true);
      });
    });

    it('should reject empty content', () => {
      const result = validateGeneratedContent('');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('empty'))).toBe(true);
    });

    it('should reject content that is too short', () => {
      const result = validateGeneratedContent('Hi');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
    });

    it('should reject content that is too long', () => {
      const longContent = 'a'.repeat(300);
      const result = validateGeneratedContent(longContent);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds 280'))).toBe(true);
    });

    it('should detect suspicious URLs', () => {
      const content =
        'Check out this file at https://example.com/malware.exe for more info';
      const result = validateGeneratedContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Suspicious URL'))).toBe(
        true
      );
    });

    it('should detect shortened URLs', () => {
      const content = 'Read more at https://bit.ly/abc123 for details';
      const result = validateGeneratedContent(content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Suspicious URL'))).toBe(
        true
      );
    });
  });

  describe('ArticleCandidatesSearchSchema', () => {
    it('should accept valid search params with category only', () => {
      const input = { category: 'ai_ml', limit: 10 };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid search params with keyword only', () => {
      const input = { keyword: 'Claude Code', limit: 10 };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid search params with both category and keyword', () => {
      const input = { category: 'ai_ml', keyword: 'Claude', limit: 5 };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept empty params (all optional)', () => {
      const input = {};
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const input = { category: 'invalid_category' };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject keyword that is too long', () => {
      const input = { keyword: 'a'.repeat(101) };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit that exceeds maximum', () => {
      const input = { limit: 51 };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should use default limit when not provided', () => {
      const input = { category: 'frontend' };
      const result = ArticleCandidatesSearchSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should accept all valid article categories', () => {
      ARTICLE_CATEGORIES.forEach((category) => {
        const result = ArticleCandidatesSearchSchema.safeParse({ category });
        expect(result.success).toBe(true);
      });
    });

    it('should accept boundary limit values (1 and 50)', () => {
      const result1 = ArticleCandidatesSearchSchema.safeParse({ limit: 1 });
      expect(result1.success).toBe(true);

      const result50 = ArticleCandidatesSearchSchema.safeParse({ limit: 50 });
      expect(result50.success).toBe(true);
    });

    it('should reject limit less than 1', () => {
      const result = ArticleCandidatesSearchSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should coerce string limit to number', () => {
      const result = ArticleCandidatesSearchSchema.safeParse({ limit: '25' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(25);
      }
    });
  });

  describe('ARTICLE_CATEGORIES', () => {
    it('should be in sync with Prisma ArticleCategory enum', () => {
      // Prisma enumの値を取得
      const prismaCategories = Object.values(ArticleCategory);

      // ARTICLE_CATEGORIESの値と比較
      expect(new Set(ARTICLE_CATEGORIES)).toEqual(new Set(prismaCategories));
      expect(ARTICLE_CATEGORIES.length).toBe(prismaCategories.length);
    });
  });
});
