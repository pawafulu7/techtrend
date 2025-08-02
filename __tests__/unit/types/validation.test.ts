import { Prisma } from '@prisma/client';
import type { ArticleWhereInput, ArticleOrderByInput } from '@/types/models';

describe('型定義の検証', () => {
  describe('ArticleWhereInput', () => {
    it('有効なWhere条件を受け入れる', () => {
      const validWhere: ArticleWhereInput = {
        sourceId: 'source-id',
        qualityScore: { gte: 50 },
        tags: {
          some: {
            name: 'JavaScript',
          },
        },
        publishedAt: {
          gte: new Date('2024-01-01'),
        },
      };

      // 型エラーが発生しないことを確認
      expect(validWhere).toBeDefined();
    });

    it('複雑な条件を受け入れる', () => {
      const complexWhere: ArticleWhereInput = {
        AND: [
          { sourceId: 'source-1' },
          { qualityScore: { gte: 70 } },
        ],
        OR: [
          { title: { contains: 'React' } },
          { summary: { contains: 'React' } },
        ],
        tags: {
          some: {
            name: { in: ['React', 'Vue.js', 'Angular'] },
          },
        },
      };

      expect(complexWhere).toBeDefined();
    });
  });

  describe('ArticleOrderByInput', () => {
    it('有効なOrderBy条件を受け入れる', () => {
      const validOrderBy: ArticleOrderByInput = {
        publishedAt: 'desc',
        qualityScore: 'desc',
      };

      expect(validOrderBy).toBeDefined();
    });

    it('複数のソート条件を受け入れる', () => {
      const multipleOrderBy: ArticleOrderByInput[] = [
        { qualityScore: 'desc' },
        { publishedAt: 'desc' },
        { bookmarks: 'desc' },
      ];

      expect(multipleOrderBy).toHaveLength(3);
    });
  });

  describe('Prisma型との互換性', () => {
    it('PrismaのArticleWhereInputと互換性がある', () => {
      const whereInput: Prisma.ArticleWhereInput = {
        id: 'article-id',
        title: { contains: 'Test' },
        sourceId: 'source-id',
        qualityScore: { gte: 50, lte: 100 },
        tags: {
          some: {
            name: 'JavaScript',
          },
        },
      };

      // ArticleWhereInputとして使用可能
      const customWhere: ArticleWhereInput = whereInput;
      expect(customWhere).toBeDefined();
    });
  });
});