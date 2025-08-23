// モック
jest.mock('@/lib/prisma', () => ({
  prisma: {
    articleView: {
      findMany: jest.fn(),
    },
    favorite: {
      findMany: jest.fn(),
    },
    article: {
      findMany: jest.fn(),
    },
  },
}));

import { RecommendationService } from '@/lib/recommendation/recommendation-service';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/redis/factory', () => ({
  getRedisService: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    getJSON: jest.fn(),
    setJSON: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  })),
}));

describe('RecommendationService', () => {
  let service: RecommendationService;
  let redisService: any;

  beforeEach(() => {
    // Get the mocked redis service
    const { getRedisService } = require('@/lib/redis/factory');
    redisService = getRedisService();
    
    service = new RecommendationService();
    jest.clearAllMocks();
  });

  describe.skip('getUserInterests', () => {
    it('should return cached interests if available', async () => {
      const cachedData = {
        tagScores: { React: 10, TypeScript: 8 },
        totalActions: 5,
        lastUpdated: new Date().toISOString(),
      };
      
      (redisService.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getUserInterests('user123');

      expect(result).not.toBeNull();
      expect(result?.tagScores.get('React')).toBe(10);
      expect(result?.tagScores.get('TypeScript')).toBe(8);
      expect(result?.totalActions).toBe(5);
    });

    it('should calculate interests from views and favorites', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);

      const mockViews = [
        {
          viewedAt: new Date(),
          article: {
            tags: [
              { name: 'React' },
              { name: 'JavaScript' },
            ],
          },
        },
      ];

      const mockFavorites = [
        {
          createdAt: new Date(),
          article: {
            tags: [
              { name: 'React' },
              { name: 'TypeScript' },
            ],
          },
        },
      ];

      (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);

      const result = await service.getUserInterests('user123');

      expect(result).not.toBeNull();
      expect(result?.tagScores.get('React')).toBeGreaterThan(0);
      expect(result?.totalActions).toBe(2);
    });

    it('should return null for users with no activity', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getUserInterests('user123');

      expect(result).toBeNull();
    });
  });

  describe('calculateRecommendationScore', () => {
    it('should calculate score based on tag matches', () => {
      const article = {
        id: 'article1',
        tags: [
          { name: 'React' },
          { name: 'TypeScript' },
        ],
        publishedAt: new Date(),
        qualityScore: 80,
      };

      const interests = {
        tagScores: new Map([
          ['React', 10],
          ['TypeScript', 8],
          ['Vue', 5],
        ]),
        totalActions: 5,
        lastUpdated: new Date(),
      };

      const result = service.calculateRecommendationScore(article, interests);

      expect(result.articleId).toBe('article1');
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons).toContain('あなたが興味のある「React」「TypeScript」に関連');
    });

    it('should boost score for new articles', () => {
      const newArticle = {
        id: 'article1',
        tags: [{ name: 'React' }],
        publishedAt: new Date(), // 今公開された記事
        qualityScore: 80,
      };

      const oldArticle = {
        id: 'article2',
        tags: [{ name: 'React' }],
        publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7日前
        qualityScore: 80,
      };

      const interests = {
        tagScores: new Map([['React', 10]]),
        totalActions: 1,
        lastUpdated: new Date(),
      };

      const newScore = service.calculateRecommendationScore(newArticle, interests);
      const oldScore = service.calculateRecommendationScore(oldArticle, interests);

      expect(newScore.score).toBeGreaterThan(oldScore.score);
      expect(newScore.reasons).toContain('最新の記事');
    });

    it('should consider quality score', () => {
      const highQuality = {
        id: 'article1',
        tags: [{ name: 'React' }],
        publishedAt: new Date(),
        qualityScore: 90,
      };

      const lowQuality = {
        id: 'article2',
        tags: [{ name: 'React' }],
        publishedAt: new Date(),
        qualityScore: 50,
      };

      const interests = {
        tagScores: new Map([['React', 10]]),
        totalActions: 1,
        lastUpdated: new Date(),
      };

      const highScore = service.calculateRecommendationScore(highQuality, interests);
      const lowScore = service.calculateRecommendationScore(lowQuality, interests);

      expect(highScore.score).toBeGreaterThan(lowScore.score);
      expect(highScore.reasons).toContain('高品質な記事');
    });
  });

  describe('getRecommendations', () => {
    it('should return default recommendations for new users', async () => {
      (redisService.get as jest.Mock).mockResolvedValue(null);
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);

      const mockArticles = [
        {
          id: 'article1',
          title: 'Popular Article',
          url: 'https://example.com/1',
          summary: 'Summary',
          thumbnail: null,
          publishedAt: new Date(),
          qualityScore: 85,
          source: { name: 'Source1' },
          tags: [{ name: 'React' }],
        },
      ];

      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const result = await service.getRecommendations('user123', 5);

      expect(result).toHaveLength(1);
      expect(result[0].recommendationReasons).toContain('話題の記事');
    });

    it('should exclude already viewed articles', async () => {
      const interests = {
        tagScores: new Map([['React', 10]]),
        totalActions: 5,
        lastUpdated: new Date(),
      };

      // Mock getUserInterests to return valid interests
      jest.spyOn(service, 'getUserInterests').mockResolvedValue(interests);

      // Mock viewed articles
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue([
        { articleId: 'viewed1' },
      ]);

      const mockArticles = [
        {
          id: 'article1',
          title: 'New Article',
          url: 'https://example.com/1',
          summary: 'Summary',
          thumbnail: null,
          publishedAt: new Date(),
          qualityScore: 80,
          source: { name: 'Source1' },
          tags: [{ name: 'React' }],
        },
      ];

      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const result = await service.getRecommendations('user123', 10);

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['viewed1'] },
          }),
        })
      );
    });
  });

  describe('getDefaultRecommendations', () => {
    it('should return popular recent articles', async () => {
      const mockArticles = [
        {
          id: 'article1',
          title: 'High Quality Article',
          url: 'https://example.com/1',
          summary: 'Summary',
          thumbnail: null,
          publishedAt: new Date(),
          qualityScore: 95,
          source: { name: 'Source1' },
          tags: [{ name: 'React' }],
        },
        {
          id: 'article2',
          title: 'Another Quality Article',
          url: 'https://example.com/2',
          summary: 'Summary 2',
          thumbnail: null,
          publishedAt: new Date(),
          qualityScore: 90,
          source: { name: 'Source2' },
          tags: [{ name: 'TypeScript' }],
        },
      ];

      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);

      const result = await service.getDefaultRecommendations(5);

      expect(result).toHaveLength(2);
      expect(result[0].recommendationScore).toBe(0.95);
      expect(result[1].recommendationScore).toBe(0.9);
    });
  });
});