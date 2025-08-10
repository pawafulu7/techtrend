import { 
  apiRequest, 
  assertApiResponse,
  simulateError 
} from '../../helpers/api-test-utils';
import { 
  createTestSources,
  createTestSourceStats 
} from '../../helpers/factories';
import { server } from '../../msw/server';

// Setup MSW for this test file
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Sources API', () => {
  describe('GET /api/sources', () => {
    it('should return sources list', async () => {
      const response = await apiRequest('/api/sources');
      
      expect(response.status).toBe(200);
      assertApiResponse(response.data);
      
      const { sources, total } = response.data;
      expect(Array.isArray(sources)).toBe(true);
      expect(typeof total).toBe('number');
      expect(sources.length).toBe(total);
    });
    
    it('should validate source structure', async () => {
      const response = await apiRequest('/api/sources');
      
      const { sources } = response.data;
      const source = sources[0];
      
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
      const response = await apiRequest('/api/sources');
      
      const { sources } = response.data;
      sources.forEach((source: any) => {
        expect(source.enabled).toBe(true);
      });
    });
    
    it('should handle server errors gracefully', async () => {
      simulateError('/api/sources', 500, 'Database connection failed');
      
      const response = await apiRequest('/api/sources');
      
      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe('Database connection failed');
    });
  });
  
  describe('GET /api/sources/stats', () => {
    it('should return source statistics', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      expect(response.status).toBe(200);
      assertApiResponse(response.data);
      
      const { stats, total, averageQualityScore, totalArticles } = response.data;
      expect(Array.isArray(stats)).toBe(true);
      expect(typeof total).toBe('number');
      expect(typeof averageQualityScore).toBe('number');
      expect(typeof totalArticles).toBe('number');
    });
    
    it('should validate stats structure', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      const { stats } = response.data;
      const stat = stats[0];
      
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
      expect(['community', 'company_blog', 'news_site', 'personal_blog', 'other']).toContain(stat.category);
    });
    
    it('should calculate aggregate metrics correctly', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      const { stats, totalArticles, averageQualityScore } = response.data;
      
      // Verify total articles sum
      const calculatedTotal = stats.reduce((sum: number, stat: any) => 
        sum + stat.totalArticles, 0
      );
      expect(totalArticles).toBe(calculatedTotal);
      
      // Verify average quality score
      const calculatedAverage = Math.round(
        stats.reduce((sum: number, stat: any) => 
          sum + stat.avgQualityScore, 0
        ) / stats.length
      );
      expect(averageQualityScore).toBe(calculatedAverage);
    });
    
    it('should return stats for all enabled sources', async () => {
      const sourcesResponse = await apiRequest('/api/sources');
      const statsResponse = await apiRequest('/api/sources/stats');
      
      const { sources } = sourcesResponse.data;
      const { stats } = statsResponse.data;
      
      // Each enabled source should have stats
      expect(stats.length).toBe(sources.length);
      
      // Verify all source IDs match
      const sourceIds = sources.map((s: any) => s.id).sort();
      const statsIds = stats.map((s: any) => s.sourceId).sort();
      expect(statsIds).toEqual(sourceIds);
    });
    
    it('should validate quality score ranges', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      const { stats } = response.data;
      stats.forEach((stat: any) => {
        // Quality scores should be between 0-100
        expect(stat.avgQualityScore).toBeGreaterThanOrEqual(0);
        expect(stat.avgQualityScore).toBeLessThanOrEqual(100);
      });
    });
    
    it('should validate publish frequency ranges', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      const { stats } = response.data;
      stats.forEach((stat: any) => {
        // Publish frequency should be positive
        expect(stat.publishFrequency).toBeGreaterThanOrEqual(0);
        // Reasonable upper limit (e.g., 10 articles per day)
        expect(stat.publishFrequency).toBeLessThanOrEqual(10);
      });
    });
    
    it('should validate growth rate ranges', async () => {
      const response = await apiRequest('/api/sources/stats');
      
      const { stats } = response.data;
      stats.forEach((stat: any) => {
        // Growth rate can be negative (decline) or positive
        expect(stat.growthRate).toBeGreaterThanOrEqual(-100);
        expect(stat.growthRate).toBeLessThanOrEqual(1000);
      });
    });
    
    it('should handle server errors gracefully', async () => {
      simulateError('/api/sources/stats', 500, 'Statistics calculation failed');
      
      const response = await apiRequest('/api/sources/stats');
      
      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe('Statistics calculation failed');
    });
  });
  
  describe('Caching behavior', () => {
    it('should cache stats responses', async () => {
      // First request
      const response1 = await apiRequest('/api/sources/stats');
      expect(response1.status).toBe(200);
      
      // Second request - should return same data
      const response2 = await apiRequest('/api/sources/stats');
      expect(response2.status).toBe(200);
      
      // Data should be consistent
      expect(response1.data).toEqual(response2.data);
    });
    
    it('should cache sources list separately from stats', async () => {
      const sourcesResponse = await apiRequest('/api/sources');
      const statsResponse = await apiRequest('/api/sources/stats');
      
      // Both should succeed independently
      expect(sourcesResponse.status).toBe(200);
      expect(statsResponse.status).toBe(200);
      
      // Different data structures
      expect(sourcesResponse.data).toHaveProperty('sources');
      expect(statsResponse.data).toHaveProperty('stats');
    });
  });
});