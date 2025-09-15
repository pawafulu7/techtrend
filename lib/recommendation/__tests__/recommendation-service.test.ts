import * as utils from '../utils';

// Mock Prisma using the shared manual mock instance
jest.mock('@/lib/prisma');

// Mock Redis factory
jest.mock('@/lib/redis/factory', () => ({
  getRedisService: jest.fn(),
}));

// Import after mocks
import { RecommendationService } from '../recommendation-service';
import { prisma } from '@/lib/prisma';
import { getRedisService } from '@/lib/redis/factory';

describe.skip('RecommendationService', () => {
  let service: RecommendationService;
  let mockRedisService: {
    getJSON: jest.Mock;
    setJSON: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRedisService = {
      getJSON: jest.fn(),
      setJSON: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
    };
    
    (getRedisService as jest.Mock).mockReturnValue(mockRedisService);
    service = new RecommendationService();
  });

  describe('getUserInterests', () => {
    const userId = 'test-user-id';
    const mockViews = [
      {
        userId,
        article: {
          id: 'article-1',
          tags: [
            { id: 'tag-1', name: 'React' },
            { id: 'tag-2', name: 'TypeScript' },
          ],
        },
      },
    ];

    const mockFavorites = [
      {
        userId,
        article: {
          id: 'article-2',
          tags: [
            { id: 'tag-1', name: 'React' },
            { id: 'tag-3', name: 'JavaScript' },
          ],
        },
      },
    ];

    it('should return cached interests if available', async () => {
      const cachedInterests = {
        tagScores: { React: 10, TypeScript: 5 },
        totalActions: 15,
        lastUpdated: new Date().toISOString(),
      };
      
      mockRedisService.getJSON.mockResolvedValue(cachedInterests);
      
      const result = await service.getUserInterests(userId);
      
      expect(result).toEqual({
        tagScores: new Map([['React', 10], ['TypeScript', 5]]),
        totalActions: 15,
        lastUpdated: new Date(cachedInterests.lastUpdated),
      });
      
      expect(mockRedisService.getJSON).toHaveBeenCalledWith(`user:interests:${userId}`);
    });

    it('should calculate interests from database if cache miss', async () => {
      mockRedisService.getJSON.mockResolvedValue(null);
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);
      
      const result = await service.getUserInterests(userId);
      
      expect(result).not.toBeNull();
      expect(result?.tagScores).toBeInstanceOf(Map);
      expect(result?.tagScores.has('React')).toBe(true);
      expect(result?.totalActions).toBeGreaterThan(0);
      
      expect(mockRedisService.setJSON).toHaveBeenCalled();
    });

    it('should handle users with no activity', async () => {
      mockRedisService.getJSON.mockResolvedValue(null);
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue([]);
      
      const result = await service.getUserInterests(userId);
      
      expect(result).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisService.getJSON.mockRejectedValue(new Error('Redis error'));
      (prisma.articleView.findMany as jest.Mock).mockResolvedValue(mockViews);
      (prisma.favorite.findMany as jest.Mock).mockResolvedValue(mockFavorites);
      
      const result = await service.getUserInterests(userId);
      
      expect(result).not.toBeNull();
      expect(result?.tagScores).toBeInstanceOf(Map);
    });
  });

  describe('getRecommendations', () => {
    const userId = 'test-user-id';
    const mockArticles = [
      {
        id: 'article-1',
        title: 'React Tutorial',
        summary: 'Learn React basics',
        tags: [
          { id: 'tag-1', name: 'React' },
          { id: 'tag-2', name: 'JavaScript' },
        ],
        source: { id: 'source-1', name: 'Dev.to' },
        viewCount: 100,
        favoriteCount: 10,
        publishedAt: new Date(),
      },
      {
        id: 'article-2',
        title: 'TypeScript Guide',
        summary: 'TypeScript best practices',
        tags: [
          { id: 'tag-3', name: 'TypeScript' },
        ],
        source: { id: 'source-2', name: 'Medium' },
        viewCount: 50,
        favoriteCount: 5,
        publishedAt: new Date(),
      },
    ];

    beforeEach(() => {
      jest.spyOn(service, 'getUserInterests').mockResolvedValue({
        tagScores: new Map([['React', 10], ['TypeScript', 5]]),
        totalActions: 15,
        lastUpdated: new Date(),
      });
    });

    it('should return personalized recommendations', async () => {
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      
      const result = await service.getRecommendations(userId, 10);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('score');
      expect(result[0]).toHaveProperty('reasons');
      
      expect(prisma.article.findMany).toHaveBeenCalled();
    });

    it('should exclude viewed articles within 7 days', async () => {
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      
      await service.getRecommendations(userId, 10, {
        excludeViewedWithinDays: 7,
        includeTags: [],
        excludeTags: [],
      });
      
      const findManyCall = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where).toHaveProperty('NOT');
      expect(findManyCall.where.NOT).toHaveProperty('views');
    });

    it('should handle tag filters', async () => {
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      
      await service.getRecommendations(userId, 10, {
        excludeViewedWithinDays: 7,
        includeTags: ['React'],
        excludeTags: ['Angular'],
      });
      
      const findManyCall = (prisma.article.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.tags).toBeDefined();
    });

    it('should return popular articles for users without interests', async () => {
      jest.spyOn(service, 'getUserInterests').mockResolvedValue(null);
      (prisma.article.findMany as jest.Mock).mockResolvedValue(mockArticles);
      
      const result = await service.getRecommendations(userId, 10);
      
      expect(result).toHaveLength(2);
      expect(result[0].reasons).toContain('人気の記事');
    });

    it('should limit results to requested count', async () => {
      const manyArticles = Array.from({ length: 20 }, (_, i) => ({
        ...mockArticles[0],
        id: `article-${i}`,
      }));
      
      (prisma.article.findMany as jest.Mock).mockResolvedValue(manyArticles);
      
      const result = await service.getRecommendations(userId, 5);
      
      expect(result).toHaveLength(5);
    });
  });

  describe('getRelatedArticles', () => {
    const articleId = 'test-article-id';
    const mockArticle = {
      id: articleId,
      tags: [
        { id: 'tag-1', name: 'React' },
        { id: 'tag-2', name: 'JavaScript' },
      ],
    };

    const mockRelatedArticles = [
      {
        id: 'related-1',
        title: 'React Hooks',
        summary: 'Learn about React Hooks',
        tags: [
          { id: 'tag-1', name: 'React' },
        ],
        source: { id: 'source-1', name: 'Dev.to' },
        viewCount: 50,
        favoriteCount: 5,
        publishedAt: new Date(),
      },
    ];

    it('should return related articles based on tags', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([mockArticle])
        .mockResolvedValueOnce(mockRelatedArticles);
      
      const result = await service.getRelatedArticles(articleId, 5);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'related-1');
      expect(result[0]).toHaveProperty('score');
      expect(result[0]).toHaveProperty('reasons');
    });

    it('should handle article not found', async () => {
      (prisma.article.findMany as jest.Mock).mockResolvedValue([]);
      
      const result = await service.getRelatedArticles(articleId, 5);
      
      expect(result).toEqual([]);
    });

    it('should exclude the original article from results', async () => {
      (prisma.article.findMany as jest.Mock)
        .mockResolvedValueOnce([mockArticle])
        .mockResolvedValueOnce([mockArticle, ...mockRelatedArticles]);
      
      const result = await service.getRelatedArticles(articleId, 5);
      
      const ids = result.map(r => r.id);
      expect(ids).not.toContain(articleId);
    });
  });

  describe('scoring logic', () => {
    it('should calculate tag-based score correctly', () => {
      const tagScore = utils.calculateTimeWeight(1); // Recent action
      expect(tagScore).toBeGreaterThan(0);
      expect(tagScore).toBeLessThanOrEqual(1);
    });

    it('should apply freshness boost', () => {
      const recentDate = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      
      const recentBoost = utils.calculateFreshnessBoost(recentDate);
      const oldBoost = utils.calculateFreshnessBoost(oldDate);
      
      expect(recentBoost).toBeGreaterThan(oldBoost);
    });

    it('should normalize scores properly', () => {
      const scores = [10, 20, 30, 40, 50];
      const normalized = scores.map(s => utils.normalizeScore(s, 10, 50));
      
      expect(normalized[0]).toBe(0); // Min becomes 0
      expect(normalized[4]).toBe(1); // Max becomes 1
      expect(normalized[2]).toBeCloseTo(0.5, 1); // Middle is around 0.5
    });
  });
});
