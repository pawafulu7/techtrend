/**
 * UnifiedSummaryService のユニットテスト
 */

// node-fetchのモックを先に定義
jest.mock('node-fetch');

// 動的インポートのモック
jest.mock('../../../lib/utils/summary-post-processor', () => ({
  postProcessSummaries: jest.fn((summary, detailedSummary) => ({
    summary,
    detailedSummary
  }))
}));

// 品質チェッカーのモック
jest.mock('../../../lib/utils/summary-quality-checker', () => ({
  checkSummaryQuality: jest.fn(() => ({
    score: 85,
    itemCountValid: true,
    itemCount: 5,
    isValid: true,
    requiresRegeneration: false,
    issues: []
  }))
}));

import { UnifiedSummaryService } from '@/lib/ai/unified-summary-service';

// デフォルトのモックレスポンス（本番と同じフォーマット）
const defaultMockResponse = {
  candidates: [{
    content: {
      parts: [{
        text: `要約: TypeScript 5.0では型安全性が強化され、開発者体験が向上します。新機能により既存コードの保守性が改善されます。

詳細要約:
・型パラメータ推論の改善：既存コードのメンテナンスが容易になり、型安全性が向上します
・デコレータの安定化：フレームワーク間の互換性が確保され、メタプログラミングが強化されます
・構成型の最適化：ビルド時間が短縮され、開発効率が大幅に改善されます
・モジュール解決の強化：ESモジュールとの統合がスムーズになり、パッケージ管理が簡素化されます
・エラーメッセージの改善：デバッグが効率化され、問題解決が迅速化されます

タグ: TypeScript,JavaScript,開発ツール,型システム,ES2023
カテゴリ: language`
      }]
    }
  }]
};

describe('UnifiedSummaryService', () => {
  let service: UnifiedSummaryService;
  let mockFetch: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    // Backup original environment
    originalEnv = { ...process.env };
  });

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
    // Clear environment for next test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('generate', () => {
    const mockTitle = 'TypeScript 5.0の新機能について';
    const mockContent = 'TypeScript 5.0では様々な新機能が追加されました...';


    it('should validate summary length', async () => {
      const result = await service.generate(mockTitle, mockContent);

      expect(result.summary.length).toBeLessThanOrEqual(400);
      expect(result.summary.length).toBeGreaterThan(0);
    }, 30000);

    it('should validate tags array', async () => {
      const result = await service.generate(mockTitle, mockContent);

      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags.length).toBeLessThanOrEqual(5);
    }, 30000);


    it('should validate difficulty values', async () => {
      const result = await service.generate(mockTitle, mockContent);

      const validDifficulties = ['beginner', 'intermediate', 'advanced', null, undefined];
      expect(validDifficulties).toContain(result.difficulty);
    }, 30000);

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