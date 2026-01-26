import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Create mock before importing
const prismaMock = mockDeep<PrismaClient>();

// Mock prisma
jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

// Import after mocks
import { SocialPostSelector } from '@/lib/social-post/social-post-selector';

describe('SocialPostSelector', () => {
  let selector: SocialPostSelector;

  const mockArticles = [
    {
      id: 'article-1',
      title: 'Claude Code 1.0.40 Released',
      translatedTitle: 'Claude Code 1.0.40リリース',
      summary: 'New features for Claude Code including improved performance',
      detailedSummary: null,
      category: 'ai_ml',
      publishedAt: new Date('2026-01-25T10:00:00Z'),
      createdAt: new Date('2026-01-25T12:00:00Z'),
      qualityScore: 80,
      skipReason: null,
      sourceId: 'source-1',
      source: { name: 'Hacker News' },
      tags: [{ name: 'AI' }, { name: 'Claude' }],
    },
    {
      id: 'article-2',
      title: 'React 20 Preview',
      translatedTitle: 'React 20 プレビュー',
      summary: 'Preview of the next React version with new features',
      detailedSummary: null,
      category: 'frontend',
      publishedAt: new Date('2026-01-25T09:00:00Z'),
      createdAt: new Date('2026-01-25T11:00:00Z'),
      qualityScore: 75,
      skipReason: null,
      sourceId: 'source-2',
      source: { name: 'Dev.to' },
      tags: [{ name: 'React' }, { name: 'Frontend' }],
    },
    {
      id: 'article-3',
      title: 'TypeScript 6.0 Features',
      translatedTitle: 'TypeScript 6.0の新機能',
      summary: 'Overview of TypeScript 6.0 new features',
      detailedSummary: null,
      category: 'frontend',
      publishedAt: new Date('2026-01-25T08:00:00Z'),
      createdAt: new Date('2026-01-25T10:00:00Z'),
      qualityScore: 70,
      skipReason: null,
      sourceId: 'source-2',
      source: { name: 'Dev.to' },
      tags: [{ name: 'TypeScript' }],
    },
  ];

  beforeEach(() => {
    mockReset(prismaMock);
    selector = new SocialPostSelector(prismaMock as unknown as PrismaClient);
  });

  describe('searchCandidateArticles', () => {
    it('should return articles matching category filter', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([
        mockArticles[0],
      ]);

      const result = await selector.searchCandidateArticles({
        category: 'ai_ml',
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('article-1');
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'ai_ml',
          }),
        })
      );
    });

    it('should return articles matching keyword filter', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([
        mockArticles[0],
      ]);

      const result = await selector.searchCandidateArticles({
        keyword: 'Claude',
        limit: 10,
      });

      expect(result).toHaveLength(1);
      // キーワード検索時はAND配列構造になる
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    title: expect.objectContaining({ contains: 'Claude' }),
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('should return articles matching both category and keyword', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([
        mockArticles[0],
      ]);

      const result = await selector.searchCandidateArticles({
        category: 'ai_ml',
        keyword: 'Claude',
        limit: 10,
      });

      expect(result).toHaveLength(1);
      // キーワード検索時はAND配列構造になる（カテゴリはbaseConditions内）
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                category: 'ai_ml',
              }),
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    title: expect.objectContaining({ contains: 'Claude' }),
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('should exclude already posted articles', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([
        { sourceIds: ['article-1'] },
      ]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([
        mockArticles[1],
        mockArticles[2],
      ]);

      const result = await selector.searchCandidateArticles({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result.every((a) => a.id !== 'article-1')).toBe(true);
      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['article-1'] },
          }),
        })
      );
    });

    it('should filter articles within 24 hours', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue(
        mockArticles
      );

      await selector.searchCandidateArticles({ limit: 10 });

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        })
      );
    });

    it('should filter by qualityScore >= 50', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue(
        mockArticles
      );

      await selector.searchCandidateArticles({ limit: 10 });

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            qualityScore: { gte: 50 },
          }),
        })
      );
    });

    it('should return empty array when no articles match', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([]);

      const result = await selector.searchCandidateArticles({
        category: 'web3',
        keyword: 'nonexistent',
        limit: 10,
      });

      expect(result).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue(
        mockArticles
      );

      await selector.searchCandidateArticles({ limit: 5 });

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it('should use default limit of 10 when not specified', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue(
        mockArticles
      );

      await selector.searchCandidateArticles({});

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should order by qualityScore and createdAt descending', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue(
        mockArticles
      );

      await selector.searchCandidateArticles({ limit: 10 });

      expect(prismaMock.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
        })
      );
    });

    it('should include source name in response', async () => {
      (prismaMock.socialPost.findMany as jest.Mock).mockResolvedValue([]);
      (prismaMock.article.findMany as jest.Mock).mockResolvedValue([
        mockArticles[0],
      ]);

      const result = await selector.searchCandidateArticles({ limit: 10 });

      expect(result[0]).toHaveProperty('source');
      expect(result[0].source).toHaveProperty('name');
    });
  });
});
