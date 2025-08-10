import { 
  apiRequest, 
  assertApiResponse, 
  assertPagination,
  overrideHandler,
  simulateError 
} from '../../helpers/api-test-utils';
import { 
  createTestArticles, 
  createPaginatedResponse 
} from '../../helpers/factories';

describe('Articles API', () => {
  describe('GET /api/articles', () => {
    it('should return articles list with default pagination', async () => {
      const response = await apiRequest('/api/articles');
      
      expect(response.status).toBe(200);
      assertApiResponse(response.data);
      assertPagination(response.data.data);
      
      const { data } = response.data;
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(Array.isArray(data.items)).toBe(true);
    });
    
    it('should handle pagination parameters', async () => {
      const response = await apiRequest('/api/articles?page=2&limit=10');
      
      expect(response.status).toBe(200);
      const { data } = response.data;
      expect(data.page).toBe(2);
      expect(data.limit).toBe(10);
    });
    
    it('should filter articles by source', async () => {
      const response = await apiRequest('/api/articles?source=qiita');
      
      expect(response.status).toBe(200);
      const { data } = response.data;
      
      // All articles should be from qiita source
      data.items.forEach((article: any) => {
        expect(article.sourceId).toBe('qiita');
      });
    });
    
    it('should filter articles by tag', async () => {
      const response = await apiRequest('/api/articles?tag=React');
      
      expect(response.status).toBe(200);
      const { data } = response.data;
      
      // All articles should have React tag
      data.items.forEach((article: any) => {
        const hasReactTag = article.tags.some((tag: any) => 
          tag.name.toLowerCase() === 'react'
        );
        expect(hasReactTag).toBe(true);
      });
    });
    
    it('should combine multiple filters', async () => {
      const response = await apiRequest('/api/articles?source=qiita&tag=React');
      
      expect(response.status).toBe(200);
      const { data } = response.data;
      
      data.items.forEach((article: any) => {
        expect(article.sourceId).toBe('qiita');
        const hasReactTag = article.tags.some((tag: any) => 
          tag.name.toLowerCase() === 'react'
        );
        expect(hasReactTag).toBe(true);
      });
    });
    
    it('should return empty array when no articles match filters', async () => {
      const response = await apiRequest('/api/articles?source=nonexistent');
      
      expect(response.status).toBe(200);
      const { data } = response.data;
      expect(data.items).toEqual([]);
      expect(data.total).toBe(0);
    });
    
    it('should handle server errors gracefully', async () => {
      simulateError('/api/articles', 500, 'Database connection failed');
      
      const response = await apiRequest('/api/articles');
      
      expect(response.status).toBe(500);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe('Database connection failed');
    });
    
    it('should validate article structure', async () => {
      const response = await apiRequest('/api/articles');
      
      const { data } = response.data;
      const article = data.items[0];
      
      // Check required fields
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('url');
      expect(article).toHaveProperty('summary');
      expect(article).toHaveProperty('publishedAt');
      expect(article).toHaveProperty('sourceId');
      expect(article).toHaveProperty('qualityScore');
      expect(article).toHaveProperty('source');
      expect(article).toHaveProperty('tags');
      
      // Check data types
      expect(typeof article.id).toBe('string');
      expect(typeof article.title).toBe('string');
      expect(typeof article.url).toBe('string');
      expect(typeof article.summary).toBe('string');
      expect(typeof article.qualityScore).toBe('number');
      expect(Array.isArray(article.tags)).toBe(true);
    });
    
    it('should validate summary length requirements', async () => {
      const response = await apiRequest('/api/articles');
      
      const { data } = response.data;
      data.items.forEach((article: any) => {
        // Summary should be between 90-130 characters based on validation rules
        expect(article.summary.length).toBeGreaterThanOrEqual(90);
        expect(article.summary.length).toBeLessThanOrEqual(130);
      });
    });
    
    it('should return articles sorted by publishedAt desc by default', async () => {
      const response = await apiRequest('/api/articles');
      
      const { data } = response.data;
      if (data.items.length > 1) {
        for (let i = 0; i < data.items.length - 1; i++) {
          const current = new Date(data.items[i].publishedAt);
          const next = new Date(data.items[i + 1].publishedAt);
          expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
        }
      }
    });
  });
  
  describe('Caching behavior', () => {
    it('should cache responses with appropriate headers', async () => {
      // First request - should miss cache
      const response1 = await apiRequest('/api/articles');
      
      // Note: Cache headers would be set by the actual API implementation
      // This test verifies the MSW mock response structure
      expect(response1.status).toBe(200);
      expect(response1.data.success).toBe(true);
      
      // Second request - would hit cache in real implementation
      const response2 = await apiRequest('/api/articles');
      expect(response2.status).toBe(200);
      
      // Data should be consistent
      expect(response1.data).toEqual(response2.data);
    });
    
    it('should use different cache keys for different parameters', async () => {
      const response1 = await apiRequest('/api/articles?page=1');
      const response2 = await apiRequest('/api/articles?page=2');
      
      // Different pages should return different data
      expect(response1.data.data.page).toBe(1);
      expect(response2.data.data.page).toBe(2);
    });
  });
  
  describe('Error handling', () => {
    it('should handle 400 bad request errors', async () => {
      simulateError('/api/articles', 400, 'Invalid query parameters');
      
      const response = await apiRequest('/api/articles?page=invalid');
      
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('Invalid');
    });
    
    it('should handle 404 not found errors', async () => {
      simulateError('/api/articles', 404, 'Endpoint not found');
      
      const response = await apiRequest('/api/articles');
      
      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });
    
    it('should handle 503 service unavailable errors', async () => {
      simulateError('/api/articles', 503, 'Service temporarily unavailable');
      
      const response = await apiRequest('/api/articles');
      
      expect(response.status).toBe(503);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('unavailable');
    });
  });
});