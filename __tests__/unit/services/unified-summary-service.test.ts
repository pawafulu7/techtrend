/**
 * UnifiedSummaryService のユニットテスト
 */

import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

// モックの設定
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(JSON.stringify({
            summary: 'テスト要約文。技術的な内容を含む記事の要約です。',
            detailedSummary: '## 主要ポイント\n\n- ポイント1\n- ポイント2\n- ポイント3',
            tags: ['TypeScript', 'React', 'Testing'],
            difficulty: 'intermediate'
          }))
        }
      })
    })
  }))
}));

describe.skip('UnifiedSummaryService', () => {
  let service: UnifiedSummaryService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // 環境変数をモック
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    service = new UnifiedSummaryService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generate', () => {
    const mockTitle = 'TypeScript 5.0の新機能について';
    const mockContent = 'TypeScript 5.0では様々な新機能が追加されました...';

    it('should generate unified summary with all fields', async () => {
      const result = await service.generate(mockTitle, mockContent);

      expect(result).toEqual({
        summary: 'テスト要約文。技術的な内容を含む記事の要約です。',
        detailedSummary: '## 主要ポイント\n\n- ポイント1\n- ポイント2\n- ポイント3',
        tags: ['TypeScript', 'React', 'Testing'],
        difficulty: 'intermediate'
      });
    }, 10000);

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

    it('should handle API errors gracefully', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockRejectedValue(new Error('API Error'))
        })
      }));

      const newService = new UnifiedSummaryService();
      
      await expect(newService.generate(mockTitle, mockContent))
        .rejects.toThrow('API Error');
    }, 10000);

    it('should handle malformed response', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: jest.fn().mockReturnValue('invalid json')
            }
          })
        })
      }));

      const newService = new UnifiedSummaryService();
      
      await expect(newService.generate(mockTitle, mockContent))
        .rejects.toThrow();
    }, 10000);

    it('should validate difficulty values', async () => {
      const result = await service.generate(mockTitle, mockContent);
      
      const validDifficulties = ['beginner', 'intermediate', 'advanced', null];
      expect(validDifficulties).toContain(result.difficulty);
    }, 10000);

    it('should include content in API call', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(JSON.stringify({
            summary: 'テスト要約',
            detailedSummary: '詳細要約',
            tags: ['Test'],
            difficulty: null
          }))
        }
      });

      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: mockGenerateContent
        })
      }));

      const newService = new UnifiedSummaryService();
      await newService.generate(mockTitle, mockContent);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(mockTitle)
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
      expect(['。', '！', '？', '」']).toContain(lastChar);
    }, 10000);
  });
});