/**
 * /api/trends/analysis エンドポイントのテスト
 * URLパラメータ処理とRedisキャッシュの動作確認
 */

import axios from 'axios';

describe('/api/trends/analysis API Tests', () => {
  const baseURL = 'http://localhost:3000';
  
  describe('パラメータ処理', () => {
    test('デフォルトパラメータ（days=30）', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.period).toBeDefined();
      expect(data.period.days).toBe(30);
      expect(data.topTags).toBeDefined();
      expect(data.timeline).toBeDefined();
    }, 10000);

    test('days=7 パラメータ', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?days=7`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.period.days).toBe(7);
    }, 10000);

    test('days=14 パラメータ', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?days=14`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.period.days).toBe(14);
    }, 10000);

    test('tag=JavaScript パラメータ', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?tag=JavaScript`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.tag).toBe('JavaScript');
      expect(data.timeline).toBeDefined();
      expect(data.relatedTags).toBeDefined();
    }, 10000);

    test('複合パラメータ days=7&tag=TypeScript', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?days=7&tag=TypeScript`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.period.days).toBe(7);
      expect(data.tag).toBe('TypeScript');
    }, 10000);
  });

  describe('キャッシュ動作', () => {
    test('同一パラメータでキャッシュヒット', async () => {
      // 1回目のリクエスト（キャッシュミス）
      const response1 = await axios.get(`${baseURL}/api/trends/analysis?days=3`);
      const data1 = response1.data;
      
      // 2回目のリクエスト（キャッシュヒット）
      const response2 = await axios.get(`${baseURL}/api/trends/analysis?days=3`);
      const data2 = response2.data;
      
      // キャッシュ統計を確認
      expect(data2.cache).toBeDefined();
      expect(data2.cache.hit).toBe(true);
      
      // データの一致を確認
      expect(data1.period.days).toBe(data2.period.days);
      expect(data1.topTags?.length).toBe(data2.topTags?.length);
    }, 10000);

    test('異なるパラメータで別々のキャッシュ', async () => {
      const response1 = await axios.get(`${baseURL}/api/trends/analysis?days=10`);
      const data1 = response1.data;
      
      const response2 = await axios.get(`${baseURL}/api/trends/analysis?days=20`);
      const data2 = response2.data;
      
      // 異なる期間のデータであることを確認
      expect(data1.period.days).toBe(10);
      expect(data2.period.days).toBe(20);
    }, 10000);
  });

  describe('レスポンス構造', () => {
    test('全体トレンド分析のレスポンス構造', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis`);
      const data = response.data;
      
      // 必須フィールドの存在確認
      expect(data).toHaveProperty('topTags');
      expect(data).toHaveProperty('timeline');
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('cache');
      
      // period構造の確認
      expect(data.period).toHaveProperty('from');
      expect(data.period).toHaveProperty('to');
      expect(data.period).toHaveProperty('days');
      
      // topTagsの構造確認
      if (data.topTags.length > 0) {
        expect(data.topTags[0]).toHaveProperty('name');
        expect(data.topTags[0]).toHaveProperty('totalCount');
      }
    }, 10000);

    test('特定タグ分析のレスポンス構造', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?tag=React`);
      const data = response.data;
      
      // 必須フィールドの存在確認
      expect(data).toHaveProperty('tag');
      expect(data).toHaveProperty('timeline');
      expect(data).toHaveProperty('relatedTags');
      expect(data).toHaveProperty('period');
      
      // タグ名の確認
      expect(data.tag).toBe('React');
      
      // relatedTagsの構造確認
      if (data.relatedTags.length > 0) {
        expect(data.relatedTags[0]).toHaveProperty('name');
        expect(data.relatedTags[0]).toHaveProperty('count');
      }
    }, 10000);
  });

  describe('エラーハンドリング', () => {
    test('無効なdays値', async () => {
      // 無効な値は400エラーを返すように修正済み
      try {
        const response = await axios.get(`${baseURL}/api/trends/analysis?days=invalid`);
        // 400エラーが返されるため、ここには到達しないはず
        expect(response.status).not.toBe(200);
      } catch (error) {
        // 400 Bad Requestが期待される
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          expect(error.response.status).toBe(400);
          expect(error.response.data).toHaveProperty('error');
          expect(error.response.data.error).toContain('Invalid days parameter');
        } else {
          throw error;
        }
      }
    }, 10000);

    test('存在しないタグ', async () => {
      const response = await axios.get(`${baseURL}/api/trends/analysis?tag=NonExistentTag123456`);
      expect(response.status).toBe(200);
      
      const data = response.data;
      expect(data.tag).toBe('NonExistentTag123456');
      expect(data.timeline).toEqual([]);
      expect(data.relatedTags).toEqual([]);
    }, 10000);
  });
});