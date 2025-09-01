import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DigestGenerator } from '@/lib/services/digest-generator';
import { PrismaClient } from '@prisma/client';

// loggerのモック
jest.mock('@/lib/logger/index', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Prismaクライアントのモック
const mockPrisma = {
  weeklyDigest: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  article: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

describe('DigestGenerator', () => {
  let digestGenerator: DigestGenerator;

  beforeEach(() => {
    jest.clearAllMocks();
    digestGenerator = new DigestGenerator(mockPrisma);
  });

  describe('generateWeeklyDigest', () => {
    it('既存のダイジェストがある場合はそのIDを返す', async () => {
      const existingDigestId = 'existing-digest-id';
      (mockPrisma.weeklyDigest.findUnique as jest.Mock).mockResolvedValue({
        id: existingDigestId,
      });

      const result = await digestGenerator.generateWeeklyDigest();

      expect(result).toBe(existingDigestId);
      expect(mockPrisma.weeklyDigest.upsert).not.toHaveBeenCalled();
    });

    it('新規ダイジェストを作成して返す', async () => {
      const newDigestId = 'new-digest-id';
      const mockArticles = [
        {
          id: 'article-1',
          title: 'Test Article 1',
          url: 'https://example.com/1',
          tags: [{ name: 'React' }, { name: 'TypeScript' }],
          _count: {
            articleViews: 100,
            favorites: 10,
          },
        },
        {
          id: 'article-2',
          title: 'Test Article 2',
          url: 'https://example.com/2',
          tags: [{ name: 'Node.js' }],
          _count: {
            articleViews: 50,
            favorites: 5,
          },
        },
      ];

      (mockPrisma.weeklyDigest.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      (mockPrisma.weeklyDigest.upsert as jest.Mock).mockResolvedValue({
        id: newDigestId,
      });

      const result = await digestGenerator.generateWeeklyDigest();

      expect(result).toBe(newDigestId);
      expect(mockPrisma.weeklyDigest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            articleCount: 2,
          }),
        })
      );
    });
  });

  describe('getWeeklyDigest', () => {
    it('存在しないダイジェストの場合はnullを返す', async () => {
      (mockPrisma.weeklyDigest.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await digestGenerator.getWeeklyDigest(new Date());

      expect(result).toBeNull();
    });

    it('ダイジェストと記事情報を返す', async () => {
      const mockDigest = {
        id: 'digest-id',
        weekStartDate: new Date('2025-08-25'),
        weekEndDate: new Date('2025-08-31'),
        articleCount: 2,
        topArticles: [
          { id: 'article-1', title: 'Article 1', url: 'url1', score: 130 },
          { id: 'article-2', title: 'Article 2', url: 'url2', score: 65 },
        ],
        categories: [],
      };

      const mockArticles = [
        {
          id: 'article-1',
          title: 'Article 1',
          source: { name: 'Dev.to' },
          tags: [{ name: 'React' }],
        },
        {
          id: 'article-2',
          title: 'Article 2',
          source: { name: 'Qiita' },
          tags: [{ name: 'Node.js' }],
        },
      ];

      (mockPrisma.weeklyDigest.findUnique as jest.Mock).mockResolvedValue(mockDigest);
      (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const result = await digestGenerator.getWeeklyDigest(new Date());

      expect(result).toBeDefined();
      expect(result?.articles).toHaveLength(2);
      expect(result?.articles[0].id).toBe('article-1');
    });
  });
});