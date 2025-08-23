/**
 * UnifiedSummaryService のユニットテスト
 */

// node-fetchのモックを先に定義
jest.mock('node-fetch');

import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

// デフォルトのモックレスポンス
const defaultMockResponse = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          summary: 'テスト要約文。技術的な内容を含む記事の要約です。',
          detailedSummary: '## 主要ポイント\n\n- ポイント1\n- ポイント2\n- ポイント3',
          tags: ['TypeScript', 'React', 'Testing'],
          difficulty: 'intermediate'
        })
      }]
    }
  }]
};

describe('UnifiedSummaryService', () => {
  let service: UnifiedSummaryService;
  let mockFetch: jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // node-fetchのモックを取得
    mockFetch = require('node-fetch').default;
    // 環境変数をモック
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    // デフォルトのfetchモック設定
    mockFetch.mockImplementation(() => Promise.resolve({
      ok: true,
      json: jest.fn().mockResolvedValue(defaultMockResponse)
    }));
    service = new UnifiedSummaryService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generate', () => {
    const mockTitle = 'TypeScript 5.0の新機能について';
    const mockContent = 'TypeScript 5.0では様々な新機能が追加されました...';


    it('should validate summary length', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      expect(result.summary.length).toBeLessThanOrEqual(400);
      expect(result.summary.length).toBeGreaterThan(0);
    }, 10000);

    it('should validate tags array', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags.length).toBeLessThanOrEqual(5);
    }, 10000);


    it('should validate difficulty values', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      const validDifficulties = ['beginner', 'intermediate', 'advanced', null, undefined];
      expect(validDifficulties).toContain(result.difficulty);
    }, 10000);

    it('should include content in API call', async () => {
      await service.generate(mockTitle, mockContent);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining(mockTitle)
        })
      );
    }, 10000);

    it('should handle empty content gracefully', async () => {
      const result = await service.generate(mockTitle, '');
      
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('detailedSummary');
      expect(result).toHaveProperty('tags');
    }, 10000);

    it('should handle very long content', async () => {
      const longContent = 'a'.repeat(100000);
      const result = await service.generate(mockTitle, longContent);
      
      expect(result).toHaveProperty('summary');
      expect(result.summary.length).toBeLessThanOrEqual(400);
    }, 10000);

    it('should ensure summary ends with proper punctuation', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      const lastChar = result.summary.slice(-1);
      expect(['。', '！', '？', '」', '.']).toContain(lastChar);
    }, 30000);
  });
});