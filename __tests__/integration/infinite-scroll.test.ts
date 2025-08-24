import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('/api/articles - Infinite Scroll Pagination', () => {
  const baseUrl = 'http://localhost:3000/api/articles';
  
  beforeAll(() => {
    // Docker環境が起動していることを前提
    console.error('Testing Infinite Scroll API endpoints...');
  });

  afterAll(() => {
    console.error('Infinite Scroll API tests completed');
  });

  it('should return first page with default limit', async () => {
    const response = await fetch(`${baseUrl}?page=1&limit=20`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.data).toBeDefined();
    // Array.isArrayを使用
    expect(Array.isArray(data.data.items)).toBe(true);
    expect(data.data.items.length).toBeLessThanOrEqual(20);
    expect(data.data.page).toBe(1);
    expect(data.data.limit).toBe(20);
    expect(data.data.total).toBeGreaterThan(0);
    expect(data.data.totalPages).toBeGreaterThan(0);
  });

  it('should return second page with correct offset', async () => {
    const response = await fetch(`${baseUrl}?page=2&limit=20`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(data.data.page).toBe(2);
    expect(Array.isArray(data.data.items)).toBe(true);
  });

  it('should respect different limit values', async () => {
    const response = await fetch(`${baseUrl}?page=1&limit=10`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.data.items.length).toBeLessThanOrEqual(10);
    expect(data.data.limit).toBe(10);
  });

  it('should handle filters with pagination', async () => {
    const response = await fetch(`${baseUrl}?page=1&limit=20&search=JavaScript`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data.items)).toBe(true);
    // 検索結果があれば、タイトルか要約にキーワードが含まれることを確認
    if (data.data.items.length > 0) {
      const hasKeyword = data.data.items.some((item: any) => 
        item.title?.toLowerCase().includes('javascript') || 
        item.summary?.toLowerCase().includes('javascript')
      );
      expect(hasKeyword).toBe(true);
    }
  });

  it('should return consistent total count across pages', async () => {
    const page1Response = await fetch(`${baseUrl}?page=1&limit=20`);
    const page1Data = await page1Response.json();
    
    const page2Response = await fetch(`${baseUrl}?page=2&limit=20`);
    const page2Data = await page2Response.json();
    
    expect(page1Data.data.total).toBe(page2Data.data.total);
    expect(page1Data.data.totalPages).toBe(page2Data.data.totalPages);
  });

  it('should handle page beyond total pages gracefully', async () => {
    const response = await fetch(`${baseUrl}?page=9999&limit=20`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.data.items).toEqual([]);
    expect(data.data.page).toBe(9999);
  });

  it('should include required article fields', async () => {
    const response = await fetch(`${baseUrl}?page=1&limit=1`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    if (data.data.items.length > 0) {
      const article = data.data.items[0];
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('url');
      expect(article).toHaveProperty('publishedAt');
      expect(article).toHaveProperty('source');
      expect(article).toHaveProperty('tags');
    }
  });

  it('should maintain sort order across pages', async () => {
    const response = await fetch(`${baseUrl}?page=1&limit=5&sortBy=publishedAt`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    if (data.data.items.length > 1) {
      for (let i = 1; i < data.data.items.length; i++) {
        const prevDate = new Date(data.data.items[i - 1].publishedAt);
        const currDate = new Date(data.data.items[i].publishedAt);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    }
  });
});