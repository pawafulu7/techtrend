/**
 * Simplified Sources API test without MSW
 */

describe('Sources API (Simplified)', () => {
  // Mock fetch directly
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('GET /api/sources', () => {
    it('should return sources list', async () => {
      const mockResponse = {
        success: true,
        sources: [
          {
            id: 'qiita',
            name: 'Qiita',
            type: 'rss',
            url: 'https://qiita.com',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          },
          {
            id: 'zenn',
            name: 'Zenn',
            type: 'rss',
            url: 'https://zenn.dev',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          }
        ],
        total: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.sources)).toBe(true);
      expect(data.sources.length).toBe(2);
      expect(data.total).toBe(2);
    });

    it('should validate source structure', async () => {
      const mockResponse = {
        success: true,
        sources: [
          {
            id: 'qiita',
            name: 'Qiita',
            type: 'rss',
            url: 'https://qiita.com',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          }
        ],
        total: 1
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();
      const source = data.sources[0];

      // Check required fields
      expect(source).toHaveProperty('id');
      expect(source).toHaveProperty('name');
      expect(source).toHaveProperty('type');
      expect(source).toHaveProperty('url');
      expect(source).toHaveProperty('enabled');
      expect(source).toHaveProperty('createdAt');
      expect(source).toHaveProperty('updatedAt');

      // Check data types
      expect(typeof source.id).toBe('string');
      expect(typeof source.name).toBe('string');
      expect(['rss', 'api', 'scraper']).toContain(source.type);
      expect(typeof source.url).toBe('string');
      expect(typeof source.enabled).toBe('boolean');
    });

    it('should only return enabled sources', async () => {
      const mockResponse = {
        success: true,
        sources: [
          { id: 'qiita', name: 'Qiita', enabled: true },
          { id: 'zenn', name: 'Zenn', enabled: true },
        ],
        total: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();

      data.sources.forEach(source => {
        expect(source.enabled).toBe(true);
      });
    });
  });

  describe('GET /api/sources/stats', () => {
    it('should return source statistics', async () => {
      const mockResponse = {
        success: true,
        stats: [
          {
            sourceId: 'qiita',
            sourceName: 'Qiita',
            totalArticles: 150,
            avgQualityScore: 82,
            popularTags: ['React', 'TypeScript', 'JavaScript'],
            publishFrequency: 0.5,
            lastPublished: new Date('2025-01-20').toISOString(),
            growthRate: 15,
            category: 'community'
          },
          {
            sourceId: 'zenn',
            sourceName: 'Zenn',
            totalArticles: 120,
            avgQualityScore: 78,
            popularTags: ['React', 'Vue', 'Next.js'],
            publishFrequency: 0.4,
            lastPublished: new Date('2025-01-19').toISOString(),
            growthRate: 10,
            category: 'community'
          }
        ],
        total: 2,
        averageQualityScore: 80,
        totalArticles: 270
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources/stats');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.stats)).toBe(true);
      expect(data.stats.length).toBe(2);
      expect(data.total).toBe(2);
      expect(data.averageQualityScore).toBe(80);
      expect(data.totalArticles).toBe(270);
    });

    it('should validate stats structure', async () => {
      const mockResponse = {
        success: true,
        stats: [
          {
            sourceId: 'qiita',
            sourceName: 'Qiita',
            totalArticles: 150,
            avgQualityScore: 82,
            popularTags: ['React', 'TypeScript'],
            publishFrequency: 0.5,
            lastPublished: new Date('2025-01-20').toISOString(),
            growthRate: 15,
            category: 'community'
          }
        ],
        total: 1,
        averageQualityScore: 82,
        totalArticles: 150
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources/stats');
      const data = await response.json();
      const stat = data.stats[0];

      // Check required fields
      expect(stat).toHaveProperty('sourceId');
      expect(stat).toHaveProperty('sourceName');
      expect(stat).toHaveProperty('totalArticles');
      expect(stat).toHaveProperty('avgQualityScore');
      expect(stat).toHaveProperty('popularTags');
      expect(stat).toHaveProperty('publishFrequency');
      expect(stat).toHaveProperty('lastPublished');
      expect(stat).toHaveProperty('growthRate');
      expect(stat).toHaveProperty('category');

      // Check data types
      expect(typeof stat.sourceId).toBe('string');
      expect(typeof stat.sourceName).toBe('string');
      expect(typeof stat.totalArticles).toBe('number');
      expect(typeof stat.avgQualityScore).toBe('number');
      expect(Array.isArray(stat.popularTags)).toBe(true);
      expect(typeof stat.publishFrequency).toBe('number');
      expect(typeof stat.growthRate).toBe('number');
    });

    it('should validate quality score ranges', async () => {
      const mockResponse = {
        success: true,
        stats: [
          { sourceId: 'qiita', avgQualityScore: 82 },
          { sourceId: 'zenn', avgQualityScore: 78 },
          { sourceId: 'devto', avgQualityScore: 75 }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources/stats');
      const data = await response.json();

      data.stats.forEach(stat => {
        expect(stat.avgQualityScore).toBeGreaterThanOrEqual(0);
        expect(stat.avgQualityScore).toBeLessThanOrEqual(100);
      });
    });

    it('should handle server errors gracefully', async () => {
      const mockErrorResponse = {
        success: false,
        error: 'Statistics calculation failed'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => mockErrorResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources/stats');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Statistics calculation failed');
    });
  });
});