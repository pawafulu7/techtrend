/**
 * Infinite Scroll統合テスト
 * React QueryとAPIの統合を確認
 */

import { describe, it, expect } from '@jest/globals';

describe('Infinite Scroll Integration Tests', () => {
  const baseUrl = 'http://localhost:3000/api/articles';

  describe('API Response Structure', () => {
    it('should return correct response structure for pagination', async () => {
      const response = await fetch(`${baseUrl}?page=1&limit=5`);
      const json = await response.json();
      
      // レスポンスのトップレベル構造を確認
      expect(response.status).toBe(200);
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('data');
      
      // data構造の確認
      const { data } = json;
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('totalPages');
      expect(data).toHaveProperty('limit');
      
      // items配列の確認
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeLessThanOrEqual(5);
      
      // ページネーション値の確認
      expect(data.page).toBe(1);
      expect(data.limit).toBe(5);
      expect(typeof data.total).toBe('number');
      expect(typeof data.totalPages).toBe('number');
    });

    it('should handle multiple pages correctly', async () => {
      // 最初のページ
      const page1Response = await fetch(`${baseUrl}?page=1&limit=10`);
      const page1Data = await page1Response.json();
      
      // 2ページ目
      const page2Response = await fetch(`${baseUrl}?page=2&limit=10`);
      const page2Data = await page2Response.json();
      
      expect(page1Data.success).toBe(true);
      expect(page2Data.success).toBe(true);
      
      // 記事の重複がないことを確認
      if (page1Data.data.items.length > 0 && page2Data.data.items.length > 0) {
        const page1Ids = page1Data.data.items.map((item: any) => item.id);
        const page2Ids = page2Data.data.items.map((item: any) => item.id);
        const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
        expect(intersection).toEqual([]);
      }
      
      // 合計数が一致することを確認
      expect(page1Data.data.total).toBe(page2Data.data.total);
      expect(page1Data.data.totalPages).toBe(page2Data.data.totalPages);
    });

    it('should respect filter parameters with pagination', async () => {
      // ソースフィルター付きのページネーション
      const response = await fetch(`${baseUrl}?page=1&limit=10&sourceId=cmdq3nwwp0006tegxz53w9zva`);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      
      // フィルターが適用されていることを確認
      if (data.data.items.length > 0) {
        data.data.items.forEach((item: any) => {
          expect(item.sourceId).toBe('cmdq3nwwp0006tegxz53w9zva');
        });
      }
    });

    it('should handle edge cases gracefully', async () => {
      // 大きなページ番号
      const largePageResponse = await fetch(`${baseUrl}?page=999&limit=20`);
      const largePageData = await largePageResponse.json();
      
      expect(largePageData.success).toBe(true);
      expect(largePageData.data.items).toEqual([]);
      expect(largePageData.data.page).toBe(999);
      
      // 最大limit値のテスト
      const maxLimitResponse = await fetch(`${baseUrl}?page=1&limit=100`);
      const maxLimitData = await maxLimitResponse.json();
      
      expect(maxLimitData.success).toBe(true);
      expect(maxLimitData.data.items.length).toBeLessThanOrEqual(100);
      expect(maxLimitData.data.limit).toBe(100);
    });
  });

  describe('Article Data Structure', () => {
    it('should include all required article fields', async () => {
      const response = await fetch(`${baseUrl}?page=1&limit=1`);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      
      if (data.data.items.length > 0) {
        const article = data.data.items[0];
        
        // 必須フィールドの確認
        expect(article).toHaveProperty('id');
        expect(article).toHaveProperty('title');
        expect(article).toHaveProperty('url');
        expect(article).toHaveProperty('summary');
        expect(article).toHaveProperty('publishedAt');
        expect(article).toHaveProperty('source');
        expect(article).toHaveProperty('tags');
        
        // source構造の確認
        expect(article.source).toHaveProperty('id');
        expect(article.source).toHaveProperty('name');
        
        // tags配列の確認
        expect(Array.isArray(article.tags)).toBe(true);
      }
    });
  });

  describe('Performance', () => {
    it('should respond within acceptable time', async () => {
      const start = Date.now();
      const response = await fetch(`${baseUrl}?page=1&limit=20`);
      await response.json();
      const end = Date.now();
      
      const responseTime = end - start;
      expect(responseTime).toBeLessThan(1000); // 1秒以内
    });

    it('should handle concurrent requests', async () => {
      const requests = [
        fetch(`${baseUrl}?page=1&limit=10`),
        fetch(`${baseUrl}?page=2&limit=10`),
        fetch(`${baseUrl}?page=3&limit=10`)
      ];
      
      const responses = await Promise.all(requests);
      const results = await Promise.all(responses.map(r => r.json()));
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.page).toBe(index + 1);
      });
    });
  });
});