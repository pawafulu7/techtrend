import {
  calculateSourceStats,
  calculateAverageQualityScore,
  extractPopularTags,
  calculatePublishFrequency,
  getLastPublishedDate,
  calculateGrowthRate,
  estimateSourceCategory,
  type ArticleWithTags,
  type SourceCategory,
} from '@/lib/utils/source-stats';

describe('source-stats', () => {
  // Test data factory
  const createArticle = (overrides?: Partial<ArticleWithTags>): ArticleWithTags => ({
    id: 'test-id',
    title: 'Test Article',
    url: 'https://test.com/article',
    summary: 'Test summary',
    content: null,
    publishedAt: new Date('2025-01-15'),
    sourceId: 'test-source',
    thumbnail: null,
    qualityScore: 75,
    summaryVersion: 5,
    articleType: 'unified',
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    tags: [],
    ...overrides,
  });

  describe('calculateSourceStats', () => {
    it('should calculate stats for multiple articles', () => {
      const articles: ArticleWithTags[] = [
        createArticle({
          qualityScore: 80,
          publishedAt: new Date('2025-01-15'),
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
            { id: '2', name: 'TypeScript', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
        createArticle({
          qualityScore: 70,
          publishedAt: new Date('2025-01-14'),
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
            { id: '3', name: 'JavaScript', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
        createArticle({
          qualityScore: 90,
          publishedAt: new Date('2025-01-13'),
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
      ];

      const stats = calculateSourceStats(articles);

      expect(stats.totalArticles).toBe(3);
      expect(stats.avgQualityScore).toBe(80); // (80 + 70 + 90) / 3
      expect(stats.popularTags).toContain('React'); // Most frequent tag
      expect(stats.publishFrequency).toBeGreaterThan(0);
      expect(stats.lastPublished).toEqual(new Date('2025-01-15'));
      expect(stats.growthRate).toBeDefined();
    });

    it('should handle empty articles array', () => {
      const articles: ArticleWithTags[] = [];
      
      const stats = calculateSourceStats(articles);

      expect(stats.totalArticles).toBe(0);
      expect(stats.avgQualityScore).toBe(0);
      expect(stats.popularTags).toEqual([]);
      expect(stats.publishFrequency).toBe(0);
      expect(stats.lastPublished).toBeNull();
      expect(stats.growthRate).toBe(0);
    });

    it('should use provided totalArticles count', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ qualityScore: 80 }),
        createArticle({ qualityScore: 70 }),
      ];
      
      const stats = calculateSourceStats(articles, 100);

      expect(stats.totalArticles).toBe(100);
      expect(stats.avgQualityScore).toBe(75); // (80 + 70) / 2
    });

    it('should handle single article', () => {
      const articles: ArticleWithTags[] = [
        createArticle({
          qualityScore: 85,
          publishedAt: new Date('2025-01-15'),
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
      ];
      
      const stats = calculateSourceStats(articles);

      expect(stats.totalArticles).toBe(1);
      expect(stats.avgQualityScore).toBe(85);
      expect(stats.popularTags).toEqual(['React']);
      expect(stats.lastPublished).toEqual(new Date('2025-01-15'));
    });
  });

  describe('calculateAverageQualityScore', () => {
    it('should calculate average quality score', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ qualityScore: 80 }),
        createArticle({ qualityScore: 70 }),
        createArticle({ qualityScore: 90 }),
        createArticle({ qualityScore: 60 }),
      ];
      
      const avg = calculateAverageQualityScore(articles);

      expect(avg).toBe(75); // (80 + 70 + 90 + 60) / 4
    });

    it('should handle articles with null quality scores', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ qualityScore: 80 }),
        createArticle({ qualityScore: null }),
        createArticle({ qualityScore: 70 }),
        createArticle({ qualityScore: null }),
      ];
      
      const avg = calculateAverageQualityScore(articles);

      expect(avg).toBe(75); // (80 + 70) / 2
    });

    it('should return 0 for empty array', () => {
      const articles: ArticleWithTags[] = [];
      
      const avg = calculateAverageQualityScore(articles);

      expect(avg).toBe(0);
    });

    it('should return 0 when all scores are null', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ qualityScore: null }),
        createArticle({ qualityScore: null }),
      ];
      
      const avg = calculateAverageQualityScore(articles);

      expect(avg).toBe(0);
    });
  });

  describe('extractPopularTags', () => {
    it('should extract most popular tags', () => {
      const articles: ArticleWithTags[] = [
        createArticle({
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
            { id: '2', name: 'TypeScript', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
        createArticle({
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
            { id: '3', name: 'JavaScript', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
        createArticle({
          tags: [
            { id: '1', name: 'React', createdAt: new Date(), updatedAt: new Date() },
            { id: '2', name: 'TypeScript', createdAt: new Date(), updatedAt: new Date() },
            { id: '3', name: 'JavaScript', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
      ];
      
      const popularTags = extractPopularTags(articles);

      expect(popularTags[0]).toBe('React'); // 3 occurrences
      expect(popularTags).toContain('TypeScript'); // 2 occurrences
      expect(popularTags).toContain('JavaScript'); // 2 occurrences
      expect(popularTags.length).toBeLessThanOrEqual(5);
    });

    it('should limit to top 5 tags', () => {
      const articles: ArticleWithTags[] = [
        createArticle({
          tags: [
            { id: '1', name: 'Tag1', createdAt: new Date(), updatedAt: new Date() },
            { id: '2', name: 'Tag2', createdAt: new Date(), updatedAt: new Date() },
            { id: '3', name: 'Tag3', createdAt: new Date(), updatedAt: new Date() },
            { id: '4', name: 'Tag4', createdAt: new Date(), updatedAt: new Date() },
            { id: '5', name: 'Tag5', createdAt: new Date(), updatedAt: new Date() },
            { id: '6', name: 'Tag6', createdAt: new Date(), updatedAt: new Date() },
            { id: '7', name: 'Tag7', createdAt: new Date(), updatedAt: new Date() },
          ],
        }),
      ];
      
      const popularTags = extractPopularTags(articles);

      expect(popularTags.length).toBe(5);
    });

    it('should handle articles without tags', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ tags: [] }),
        createArticle({ tags: [] }),
      ];
      
      const popularTags = extractPopularTags(articles);

      expect(popularTags).toEqual([]);
    });

    it('should handle empty array', () => {
      const articles: ArticleWithTags[] = [];
      
      const popularTags = extractPopularTags(articles);

      expect(popularTags).toEqual([]);
    });
  });

  describe('calculatePublishFrequency', () => {
    it('should calculate daily frequency for frequent publishing', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-15') }),
        createArticle({ publishedAt: new Date('2025-01-14') }),
        createArticle({ publishedAt: new Date('2025-01-13') }),
        createArticle({ publishedAt: new Date('2025-01-12') }),
        createArticle({ publishedAt: new Date('2025-01-11') }),
      ];
      
      // Mock current date
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const frequency = calculatePublishFrequency(articles);

      expect(frequency).toBeGreaterThan(0.5); // More than 0.5 articles per day
      expect(frequency).toBeLessThan(2); // Less than 2 articles per day
      
      jest.restoreAllMocks();
    });

    it('should calculate weekly frequency for less frequent publishing', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-15') }),
        createArticle({ publishedAt: new Date('2025-01-08') }),
        createArticle({ publishedAt: new Date('2025-01-01') }),
      ];
      
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const frequency = calculatePublishFrequency(articles);

      expect(frequency).toBeGreaterThan(0);
      expect(frequency).toBeLessThan(1);
      
      jest.restoreAllMocks();
    });

    it('should return 0 for empty array', () => {
      const articles: ArticleWithTags[] = [];
      
      const frequency = calculatePublishFrequency(articles);

      expect(frequency).toBe(0);
    });

    it('should handle single article', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-15') }),
      ];
      
      const frequency = calculatePublishFrequency(articles);

      expect(frequency).toBe(1);
    });
  });

  describe('getLastPublishedDate', () => {
    it('should return most recent publish date', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-10') }),
        createArticle({ publishedAt: new Date('2025-01-15') }),
        createArticle({ publishedAt: new Date('2025-01-12') }),
      ];
      
      const lastDate = getLastPublishedDate(articles);

      expect(lastDate).toEqual(new Date('2025-01-15'));
    });

    it('should return null for empty array', () => {
      const articles: ArticleWithTags[] = [];
      
      const lastDate = getLastPublishedDate(articles);

      expect(lastDate).toBeNull();
    });

    it('should handle single article', () => {
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-15') }),
      ];
      
      const lastDate = getLastPublishedDate(articles);

      expect(lastDate).toEqual(new Date('2025-01-15'));
    });

    it('should handle articles with same date', () => {
      const date = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: date }),
        createArticle({ publishedAt: date }),
        createArticle({ publishedAt: date }),
      ];
      
      const lastDate = getLastPublishedDate(articles);

      expect(lastDate).toEqual(date);
    });
  });

  describe('calculateGrowthRate', () => {
    it('should calculate positive growth rate', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        // Recent week: 3 articles
        createArticle({ publishedAt: new Date('2025-01-14') }),
        createArticle({ publishedAt: new Date('2025-01-13') }),
        createArticle({ publishedAt: new Date('2025-01-12') }),
        // Previous week: 1 article
        createArticle({ publishedAt: new Date('2025-01-07') }),
      ];
      
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const growthRate = calculateGrowthRate(articles);

      expect(growthRate).toBeGreaterThan(0); // Positive growth
      
      jest.restoreAllMocks();
    });

    it('should calculate negative growth rate', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        // Recent week: 1 article
        createArticle({ publishedAt: new Date('2025-01-14') }),
        // Previous week: 3 articles
        createArticle({ publishedAt: new Date('2025-01-07') }),
        createArticle({ publishedAt: new Date('2025-01-06') }),
        createArticle({ publishedAt: new Date('2025-01-05') }),
      ];
      
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const growthRate = calculateGrowthRate(articles);

      expect(growthRate).toBeLessThan(0); // Negative growth
      
      jest.restoreAllMocks();
    });

    it('should return 0 for empty array', () => {
      const articles: ArticleWithTags[] = [];
      
      const growthRate = calculateGrowthRate(articles);

      expect(growthRate).toBe(0);
    });

    it('should handle all articles in recent week', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-14') }),
        createArticle({ publishedAt: new Date('2025-01-13') }),
        createArticle({ publishedAt: new Date('2025-01-12') }),
      ];
      
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const growthRate = calculateGrowthRate(articles);

      expect(growthRate).toBe(100); // 100% growth (all new)
      
      jest.restoreAllMocks();
    });

    it('should handle all articles in previous week', () => {
      const now = new Date('2025-01-15');
      const articles: ArticleWithTags[] = [
        createArticle({ publishedAt: new Date('2025-01-07') }),
        createArticle({ publishedAt: new Date('2025-01-06') }),
        createArticle({ publishedAt: new Date('2025-01-05') }),
      ];
      
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      
      const growthRate = calculateGrowthRate(articles);

      expect(growthRate).toBe(-100); // -100% growth (no recent articles)
      
      jest.restoreAllMocks();
    });
  });

  describe('estimateSourceCategory', () => {
    it('should categorize as company blog for tech blog names', () => {
      const category = estimateSourceCategory('TechCompanyBlog');
      
      expect(category).toBe('company_blog');
    });

    it('should categorize as personal blog for generic blog names', () => {
      const category = estimateSourceCategory('MyBlog');
      
      expect(category).toBe('personal_blog');
    });

    it('should categorize as news site for news-related names', () => {
      const category = estimateSourceCategory('TechNews');
      
      expect(category).toBe('news_site');
    });

    it('should categorize as community for community platforms', () => {
      expect(estimateSourceCategory('Qiita')).toBe('community');
      expect(estimateSourceCategory('zenn')).toBe('community');
      expect(estimateSourceCategory('dev.to')).toBe('community');
      expect(estimateSourceCategory('Reddit')).toBe('community');
    });

    it('should categorize TechCrunch as news site', () => {
      const category = estimateSourceCategory('TechCrunch');
      
      expect(category).toBe('news_site');
    });

    it('should categorize Hacker News as news site', () => {
      const category = estimateSourceCategory('Hacker News');
      
      expect(category).toBe('news_site');
    });

    it('should return other for unrecognized names', () => {
      const category = estimateSourceCategory('RandomSite');
      
      expect(category).toBe('other');
    });

    it('should handle case-insensitive matching', () => {
      expect(estimateSourceCategory('QIITA')).toBe('community');
      expect(estimateSourceCategory('techcrunch')).toBe('news_site');
    });
  });
});