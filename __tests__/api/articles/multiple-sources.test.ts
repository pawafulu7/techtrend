import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { prisma } from '@/lib/prisma';

// fetchのモック
global.fetch = jest.fn();

describe.skip('Multiple Sources Filter API', () => {
  const baseUrl = 'http://localhost:3000';
  
  beforeAll(async () => {
    // Ensure we have some test data
    const sourcesCount = await prisma.source.count();
    if (sourcesCount === 0) {
      console.warn('No sources found in database for testing');
      // Create test sources
      await prisma.source.createMany({
        data: [
          { id: 'test-source-1', name: 'Test Source 1', url: 'https://test1.example.com', isActive: true },
          { id: 'test-source-2', name: 'Test Source 2', url: 'https://test2.example.com', isActive: true },
          { id: 'test-source-3', name: 'Test Source 3', url: 'https://test3.example.com', isActive: true },
        ],
        skipDuplicates: true,
      });
    }
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.article.deleteMany({
      where: {
        sourceId: {
          in: ['test-source-1', 'test-source-2', 'test-source-3']
        }
      }
    });
    await prisma.source.deleteMany({
      where: {
        id: {
          in: ['test-source-1', 'test-source-2', 'test-source-3']
        }
      }
    });
    await prisma.$disconnect();
  });

  describe('GET /api/articles with sources parameter', () => {
    it('should fetch articles from multiple sources', async () => {
      // Get available sources for testing
      const sources = await prisma.source.findMany({ take: 3 });
      
      if (sources.length >= 2) {
        const sourceIds = sources.slice(0, 2).map(s => s.id).join(',');
        const response = await fetch(`${baseUrl}/api/articles?sources=${sourceIds}`);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('items');
        expect(Array.isArray(data.data.items)).toBe(true);
        
        // Verify all articles are from selected sources
        if (data.data.items.length > 0) {
          const selectedSourceIds = sourceIds.split(',');
          data.data.items.forEach((article: any) => {
            expect(selectedSourceIds).toContain(article.sourceId);
          });
        }
      }
    });

    it('should return all articles when sources parameter is empty', async () => {
      const response = await fetch(`${baseUrl}/api/articles`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('items');
      expect(data.data).toHaveProperty('total');
    });

    it('should handle non-existent source IDs gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/articles?sources=nonexistent1,nonexistent2`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
    });

    it('should maintain backward compatibility with sourceId parameter', async () => {
      const source = await prisma.source.findFirst();
      
      if (source) {
        const response = await fetch(`${baseUrl}/api/articles?sourceId=${source.id}`);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        
        // Verify all articles are from the selected source
        if (data.data.items.length > 0) {
          data.data.items.forEach((article: any) => {
            expect(article.sourceId).toBe(source.id);
          });
        }
      }
    });

    it('should prioritize sources parameter over sourceId when both are present', async () => {
      const sources = await prisma.source.findMany({ take: 3 });
      
      if (sources.length >= 3) {
        const sourcesParam = sources.slice(0, 2).map(s => s.id).join(',');
        const sourceIdParam = sources[2].id;
        
        const response = await fetch(`${baseUrl}/api/articles?sources=${sourcesParam}&sourceId=${sourceIdParam}`);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        
        // Verify articles are from sources parameter, not sourceId
        if (data.data.items.length > 0) {
          const selectedSourceIds = sourcesParam.split(',');
          data.data.items.forEach((article: any) => {
            expect(selectedSourceIds).toContain(article.sourceId);
          });
        }
      }
    });

    it('should work with pagination', async () => {
      const sources = await prisma.source.findMany({ take: 2 });
      
      if (sources.length >= 2) {
        const sourceIds = sources.map(s => s.id).join(',');
        
        const response1 = await fetch(`${baseUrl}/api/articles?sources=${sourceIds}&page=1&limit=5`);
        const data1 = await response1.json();
        
        const response2 = await fetch(`${baseUrl}/api/articles?sources=${sourceIds}&page=2&limit=5`);
        const data2 = await response2.json();
        
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect(data1.data.page).toBe(1);
        expect(data2.data.page).toBe(2);
        expect(data1.data.limit).toBe(5);
        expect(data2.data.limit).toBe(5);
      }
    });

    it('should work with other filters (tag and search)', async () => {
      const sources = await prisma.source.findMany({ take: 2 });
      const tag = await prisma.tag.findFirst();
      
      if (sources.length >= 2 && tag) {
        const sourceIds = sources.map(s => s.id).join(',');
        
        const response = await fetch(`${baseUrl}/api/articles?sources=${sourceIds}&tag=${tag.name}&search=test`);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('items');
      }
    });

    it('should handle cache properly with different source combinations', async () => {
      const sources = await prisma.source.findMany({ take: 3 });
      
      if (sources.length >= 3) {
        // First request with sources A,B
        const sourceIds1 = sources.slice(0, 2).map(s => s.id).join(',');
        const response1 = await fetch(`${baseUrl}/api/articles?sources=${sourceIds1}`);
        const cacheStatus1 = response1.headers.get('X-Cache-Status');
        
        // Second request with same sources A,B (should hit cache)
        const response2 = await fetch(`${baseUrl}/api/articles?sources=${sourceIds1}`);
        const cacheStatus2 = response2.headers.get('X-Cache-Status');
        
        // Third request with sources B,A (different order, should still hit cache due to normalization)
        const sourceIds3 = sources.slice(0, 2).reverse().map(s => s.id).join(',');
        const response3 = await fetch(`${baseUrl}/api/articles?sources=${sourceIds3}`);
        const cacheStatus3 = response3.headers.get('X-Cache-Status');
        
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect(response3.status).toBe(200);
        
        // First request should be a miss, subsequent ones should hit cache
        expect(cacheStatus1).toBe('MISS');
        expect(cacheStatus2).toBe('HIT');
        expect(cacheStatus3).toBe('HIT');
      }
    });
  });
});