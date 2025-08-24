/**
 * Mock for UnifiedSummaryService
 * テスト用のモック実装
 */

export class UnifiedSummaryService {
  generate = jest.fn().mockImplementation(async (_title: string, _content: string) => {
    // デフォルトの成功レスポンスを返す（successフィールドなし）
    return {
      summary: 'テスト要約文。技術的な内容を含む記事の要約です。',
      detailedSummary: '## 主要ポイント\n\n- ポイント1\n- ポイント2\n- ポイント3',
      tags: ['TypeScript', 'React', 'Testing'],
      difficulty: 'intermediate'
    };
  });

  // レート制限のシミュレーション用
  simulateRateLimit = jest.fn().mockImplementation(() => {
    return {
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    };
  });

  // エラーのシミュレーション用
  simulateError = jest.fn().mockImplementation(() => {
    return {
      success: false,
      error: 'Failed to generate summary'
    };
  });
}