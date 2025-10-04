import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GeminiSummaryAdapter } from '@/lib/ai/adapter/gemini-summary-adapter';
import { GeminiTransport } from '@/lib/ai/transport/gemini-transport';
import { PromptBuilder } from '@/lib/ai/adapter/prompt-builder';
import { Config } from '@/lib/di/config';

describe('Summary and Translation Integration', () => {
  let adapter: GeminiSummaryAdapter;
  let mockTransport: jest.Mocked<GeminiTransport>;
  let promptBuilder: PromptBuilder;
  let config: Config;

  beforeEach(() => {
    config = {
      transport: {
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash-lite',
        baseUrl: 'https://api.gemini.com',
        timeout: 30000,
        maxRetries: 3,
      },
      summary: {
        maxHeadlineLength: 60,
        maxDetailedSummaryLength: 500,
        defaultLanguage: 'ja',
      },
      translation: {
        enabled: true,
        rateLimit: 30,
      },
      qualityCheck: {
        enabled: true,
        minScore: 70,
        autoFix: false,
      },
    };

    promptBuilder = new PromptBuilder();
    mockTransport = {
      invoke: jest.fn(),
    } as any;
    adapter = new GeminiSummaryAdapter(mockTransport, promptBuilder, 'gemini-2.0-flash-lite');
  });

  describe('Translation Feature in Summary Process', () => {
    it('should include translation instruction when enabled', async () => {
      const article = {
        id: 'test-1',
        title: 'Building Modern Web Applications with React',
        content: 'Article about React development...',
      };

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `要約:
ReactによるモダンなWebアプリケーション開発

日本語タイトル:
Reactによるモダンウェブアプリケーションの構築

詳細要約:
• Reactの最新機能について
• Server Componentsの活用
• パフォーマンス最適化`,
                },
              ],
            },
          },
        ],
      };

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: mockResponse,
      });

      const result = await adapter.summarize(article);

      expect(result).toEqual({
        headline: 'ReactによるモダンなWebアプリケーション開発',
        detailedSummary: '• Reactの最新機能について\n• Server Componentsの活用\n• パフォーマンス最適化',
        translatedTitle: 'Reactによるモダンウェブアプリケーションの構築',
      });

      // プロンプトに翻訳指示が含まれているか確認
      const prompt = promptBuilder.buildPrompt({
        title: article.title,
        content: article.content,
        constraints: { maxHeadlineChars: 60, detailPolicy: 'medium' },
        requestId: 'test-1',
      });
      expect(prompt).toContain('日本語タイトル:');
    });

    it('should handle missing translation gracefully', async () => {
      const article = {
        id: 'test-2',
        title: 'TypeScript Best Practices',
        content: 'TypeScript coding guidelines...',
      };

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `要約:
TypeScriptのベストプラクティス

詳細要約:
• 型安全性の確保
• 厳格モードの活用
• 型定義の最適化`,
                },
              ],
            },
          },
        ],
      };

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: mockResponse,
      });

      const result = await adapter.summarize(article);

      expect(result).toEqual({
        headline: 'TypeScriptのベストプラクティス',
        detailedSummary: '• 型安全性の確保\n• 厳格モードの活用\n• 型定義の最適化',
        translatedTitle: undefined,
      });
    });

    it('should not translate Japanese titles', async () => {
      const article = {
        id: 'test-3',
        title: 'React Server Componentsの実装ガイド',
        content: 'React Server Componentsについて...',
      };

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `要約:
React Server Componentsの実装方法解説

日本語タイトル:
翻訳不要

詳細要約:
• Server Componentsの基本概念
• 実装パターン
• パフォーマンスへの影響`,
                },
              ],
            },
          },
        ],
      };

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: mockResponse,
      });

      const result = await adapter.summarize(article);

      expect(result).toEqual({
        headline: 'React Server Componentsの実装方法解説',
        detailedSummary: '• Server Componentsの基本概念\n• 実装パターン\n• パフォーマンスへの影響',
        translatedTitle: undefined,
      });
    });

    it('should handle translation disabled in config', async () => {
      config.translation.enabled = false;
      promptBuilder = new PromptBuilder();
      adapter = new GeminiSummaryAdapter(mockTransport, promptBuilder, 'gemini-2.0-flash-lite');

      const article = {
        id: 'test-4',
        title: 'Building Scalable APIs',
        content: 'API development guide...',
      };

      const prompt = promptBuilder.buildPrompt({
        title: article.title,
        content: article.content,
        constraints: { maxHeadlineChars: 60, detailPolicy: 'medium' },
        requestId: 'test-4',
      });
      expect(prompt).not.toContain('日本語タイトル:');
    });
  });

  describe('Performance Impact', () => {
    it('should complete translation within acceptable time', async () => {
      const article = {
        id: 'perf-test',
        title: 'Performance Testing for Web Applications',
        content: 'Performance testing guide...',
      };

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `要約:
Webアプリケーションのパフォーマンステスト

日本語タイトル:
Webアプリケーションのパフォーマンステスト

詳細要約:
• テスト手法の解説`,
                },
              ],
            },
          },
        ],
      };

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        payload: mockResponse,
      });

      const startTime = Date.now();
      await adapter.summarize(article);
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(1000); // 1秒以内
    });
  });
});