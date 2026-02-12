import { GeminiSummaryAdapter } from '../gemini-summary-adapter';
import { GeminiTransport } from '../../transport/gemini-transport.interface';
import { PromptBuilder } from '../prompt-builder';
import { SummaryProviderInput } from '../summary-provider.interface';

describe('GeminiSummaryAdapter', () => {
  let adapter: GeminiSummaryAdapter;
  let mockTransport: jest.Mocked<GeminiTransport>;
  let mockPromptBuilder: jest.Mocked<PromptBuilder>;

  beforeEach(() => {
    mockTransport = {
      invoke: jest.fn(),
      warmup: jest.fn(),
    };

    mockPromptBuilder = {
      buildPrompt: jest.fn(),
    } as unknown as jest.Mocked<PromptBuilder>;

    adapter = new GeminiSummaryAdapter(mockTransport, mockPromptBuilder);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to create a JSON response payload
  function makeJsonPayload(
    json: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(json) }],
          },
          finishReason: 'STOP',
        },
      ],
    };
  }

  // Helper to create a text response payload
  function makeTextPayload(
    text: string,
    finishReason = 'STOP'
  ): Record<string, unknown> {
    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
          finishReason,
        },
      ],
    };
  }

  describe('JSON Structured Output（主経路）', () => {
    it('should parse JSON response with all fields', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article',
        content: 'Test content for article',
        articleType: 'technical',
        tone: 'formal',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-json',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('Generated prompt');

      const payload = makeJsonPayload({
        summary: 'テスト記事の要約です。技術的な内容を含む記事の概要。',
        detailedSummaryItems: [
          {
            title: 'Rustの型システム',
            content: 'Rustの所有権システムとライフタイムに関する詳細な説明',
          },
          {
            title: 'メモリ安全性',
            content: 'ガベージコレクションなしでメモリ安全性を実現する仕組み',
          },
          {
            title: '並行処理',
            content: 'データ競合をコンパイル時に検出する並行処理モデル',
          },
        ],
        category: 'Programming Language',
        tags: ['Rust', 'TypeScript', 'メモリ安全性'],
      });

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 1000,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe(
        'テスト記事の要約です。技術的な内容を含む記事の概要。'
      );
      expect(result.detailedSummary).toContain(
        '\u30FBRustの型システム\uFF1A Rustの所有権システムとライフタイムに関する詳細な説明'
      );
      expect(result.detailedSummary).toContain(
        '\u30FBメモリ安全性\uFF1A ガベージコレクションなしでメモリ安全性を実現する仕組み'
      );
      expect(result.detailedSummary).toContain(
        '\u30FB並行処理\uFF1A データ競合をコンパイル時に検出する並行処理モデル'
      );
      expect(result.category).toBe('プログラミング言語');
      expect(result.tags).toEqual(['Rust', 'TypeScript', 'メモリ安全性']);
      expect(result.confidence).toBe(0.95);
      expect(result.rawResponse).toBe(payload);
    });

    it('should map English categories to Japanese', async () => {
      const input: SummaryProviderInput = {
        title: 'AI Article',
        content: 'AI content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-category-map',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const testCases: Array<[string, string]> = [
        ['AI/ML', 'AI・機械学習'],
        ['Web Development', 'Web開発'],
        ['Cloud/Infrastructure', 'クラウド・インフラ'],
        ['Framework/Library', 'フレームワーク・ライブラリ'],
        ['Tools/DevEnv', 'ツール・開発環境'],
      ];

      for (const [english, japanese] of testCases) {
        const payload = makeJsonPayload({
          summary: 'テスト要約',
          detailedSummaryItems: [
            { title: '項目', content: '内容の説明テスト' },
          ],
          category: english,
          tags: ['test'],
        });

        mockTransport.invoke.mockResolvedValue({
          status: 'ok',
          httpStatus: 200,
          payload,
          latencyMs: 500,
          headers: {},
        });

        const result = await adapter.summarize(input);
        expect(result.category).toBe(japanese);
      }
    });

    it('should handle JSON response with empty detailedSummaryItems', async () => {
      const input: SummaryProviderInput = {
        title: 'Short Article',
        content: 'Short',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-empty-items',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeJsonPayload({
        summary: '短い記事の要約',
        detailedSummaryItems: [],
        category: 'Other',
        tags: ['test'],
      });

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('短い記事の要約');
      expect(result.detailedSummary).toBe('');
      expect(result.category).toBe('その他');
      expect(result.tags).toEqual(['test']);
    });

    it('should reject JSON response with instruction markers in summary', async () => {
      const input: SummaryProviderInput = {
        title: 'Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-json-instruction',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeJsonPayload({
        summary: 'INTERNAL METADATA: instruction contamination detected',
        detailedSummaryItems: [{ title: '項目', content: 'テスト内容' }],
        category: 'Other',
        tags: [],
      });

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Summary contains instruction markers'
      );
    });
  });

  describe('テキストフォールバック', () => {
    it('should fall back to text parsing when JSON parse fails', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article',
        content: 'Test content for article',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-fallback',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
テスト記事の要約です。

詳細要約:
・概要：詳細な説明1
・技術仕様：詳細な説明2
・実装方法：詳細な説明3

カテゴリ:
プログラミング言語

タグ:
TypeScript, Node.js, Jest`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 1000,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('テスト記事の要約です。');
      expect(result.detailedSummary).toContain('・概要：詳細な説明1');
      expect(result.detailedSummary).toContain('・技術仕様：詳細な説明2');
      expect(result.detailedSummary).toContain('・実装方法：詳細な説明3');
      expect(result.category).toBe('プログラミング言語');
      expect(result.tags).toEqual(['TypeScript', 'Node.js', 'Jest']);
      expect(result.confidence).toBe(0.95);
    });

    it('should calculate confidence from finishReason in text fallback', async () => {
      const input: SummaryProviderInput = {
        title: 'Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-conf',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
テスト

詳細要約:
・内容：詳細`,
        'MAX_TOKENS'
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 1200,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.confidence).toBe(0.7);
    });

    it('should handle text response without optional fields', async () => {
      const input: SummaryProviderInput = {
        title: 'Minimal Article',
        content: 'Minimal content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'short' },
        requestId: 'test-minimal',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
ミニマル記事

詳細要約:
・説明：詳細内容`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 800,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('ミニマル記事');
      expect(result.detailedSummary).toContain('・説明：詳細内容');
      expect(result.category).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Transport連携', () => {
    it('should send correct transport request with Structured Output config', async () => {
      const input: SummaryProviderInput = {
        title: 'Integration Test',
        content: 'Test content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'long' },
        requestId: 'test-transport',
      };

      const mockPrompt = 'Generated prompt for transport';
      mockPromptBuilder.buildPrompt.mockReturnValue(mockPrompt);

      const payload = makeJsonPayload({
        summary: 'テスト',
        detailedSummaryItems: [{ title: '項目', content: '内容' }],
        category: 'Other',
        tags: [],
      });

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await adapter.summarize(input);

      const call = mockTransport.invoke.mock.calls[0][0];
      expect(call.model).toBe('gemini-2.5-flash-lite');
      expect(call.requestId).toBe('test-transport');
      expect(call.timeoutMs).toBe(60000);

      const body = call.body as Record<string, unknown>;
      expect(body.contents).toEqual([{ parts: [{ text: mockPrompt }] }]);

      const config = (body as { generationConfig: Record<string, unknown> })
        .generationConfig;
      expect(config.temperature).toBe(0.3);
      expect(config.topK).toBe(40);
      expect(config.topP).toBe(0.95);
      expect(config.maxOutputTokens).toBe(8192);
      expect(config.responseMimeType).toBe('application/json');
      expect(config.responseSchema).toBeDefined();
      expect((config.responseSchema as Record<string, unknown>).type).toBe(
        'OBJECT'
      );
    });

    it('should use custom model when specified', async () => {
      const customAdapter = new GeminiSummaryAdapter(
        mockTransport,
        mockPromptBuilder,
        'gemini-2.0-flash'
      );

      const input: SummaryProviderInput = {
        title: 'Custom Model Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-custom',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeJsonPayload({
        summary: 'カスタムモデル',
        detailedSummaryItems: [{ title: '項目', content: '説明' }],
        category: 'Other',
        tags: [],
      });

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 600,
        headers: {},
      });

      await customAdapter.summarize(input);

      expect(mockTransport.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.0-flash',
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('should throw error on retryable transport error', async () => {
      const input: SummaryProviderInput = {
        title: 'Error Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-retry-error',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'retryable_error',
        error: new Error('Rate limit exceeded'),
        latencyMs: 100,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Retryable error during summarization: Rate limit exceeded'
      );
    });

    it('should throw error on fatal transport error', async () => {
      const input: SummaryProviderInput = {
        title: 'Fatal Error Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-fatal-error',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'fatal_error',
        error: new Error('Invalid API key'),
        latencyMs: 50,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Fatal error during summarization: Invalid API key'
      );
    });

    it('should throw error when response has no candidates', async () => {
      const input: SummaryProviderInput = {
        title: 'No Candidates',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-no-candidates',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: { candidates: [] },
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'No candidates in response'
      );
    });

    it('should throw error when text fallback headline is missing', async () => {
      const input: SummaryProviderInput = {
        title: 'Missing Headline',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-no-headline',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `詳細要約:
・説明：内容`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed: Failed to extract headline from response'
      );
    });

    it('should throw error when text fallback detailed summary is missing', async () => {
      const input: SummaryProviderInput = {
        title: 'Missing Detailed',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-no-detailed',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
ヘッドラインのみ`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed: Failed to extract detailed summary from response'
      );
    });

    it('should throw error when JSON response missing required fields', async () => {
      const input: SummaryProviderInput = {
        title: 'Bad JSON',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-bad-json',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      // Valid JSON but missing required fields - falls to text fallback which also fails
      const payload = {
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ category: 'Other' }) }],
            },
            finishReason: 'STOP',
          },
        ],
      };

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      // Missing summary + detailedSummaryItems → falls to text fallback → fails to extract headline
      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed'
      );
    });
  });

  describe('レスポンスパース（テキストフォールバック）', () => {
    it('should parse multi-line detailed summary correctly', async () => {
      const input: SummaryProviderInput = {
        title: 'Multi-line Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-multiline',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
マルチライン要約

詳細要約:
・項目1：説明1
・項目2：説明2
・項目3：説明3

カテゴリ:
Web開発

タグ:
React, TypeScript`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 700,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.detailedSummary).toContain('・項目1：説明1');
      expect(result.detailedSummary).toContain('・項目2：説明2');
      expect(result.detailedSummary).toContain('・項目3：説明3');
    });

    it('should handle tags with spaces', async () => {
      const input: SummaryProviderInput = {
        title: 'Tags Test',
        content: 'Content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-tags',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:
タグテスト

詳細要約:
・説明

タグ:
  TypeScript  ,  Node.js  ,  React  `
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 600,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.tags).toEqual(['TypeScript', 'Node.js', 'React']);
    });
  });

  describe('プロンプト混入検出', () => {
    it('should reject text response with range-based instruction markers', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article',
        content: 'Test content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-range-instruction',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n- 3000-5000文字の記事：必ず600文字以上1000文字以内で作成。\n\n詳細要約:\n・テスト項目1\n・テスト項目2`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Headline contains instruction markers'
      );
    });

    it('should reject text response with single-value instruction markers', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article 2',
        content: 'Test content 2',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-single-instruction',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n- 5000文字以上の記事：必ず800文字以上で作成。\n\n詳細要約:\n・テスト項目`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Headline contains instruction markers'
      );
    });

    it('should reject text response with full-width tilde', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article 4',
        content: 'Test content 4',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-fullwidth-tilde',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n- 3000〜5000文字の記事：600文字以上\n\n詳細要約:\n・テスト項目`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Headline contains instruction markers'
      );
    });

    it('should reject text response with full-width numbers', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article 5',
        content: 'Test content 5',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-fullwidth-numbers',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n- ３０００-５０００文字の記事：必ず作成\n\n詳細要約:\n・テスト項目`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Headline contains instruction markers'
      );
    });

    it('should reject text response with space around separator', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article 6',
        content: 'Test content 6',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-space-separator',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n- 3000 ~ 5000文字の記事：必ず600文字以上で作成\n\n詳細要約:\n・テスト項目`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Headline contains instruction markers'
      );
    });

    it('should NOT reject normal summary with numbers and keywords', async () => {
      const input: SummaryProviderInput = {
        title: 'Normal Article',
        content: 'Normal content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-normal',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約:\n2024年に3000件以上のユーザーが登録し、5000万円の売上を記録した。\n\n詳細要約:\n・実績：2024年の成果`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe(
        '2024年に3000件以上のユーザーが登録し、5000万円の売上を記録した。'
      );
      expect(result.detailedSummary).toContain('・実績：2024年の成果');
    });
  });

  describe('改行処理（テキストフォールバック）', () => {
    it('should merge continuation lines into bullet items', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article with Newlines',
        content: 'Test content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-newline',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約: テスト要約

詳細要約:
・項目1：
内容が次の行にある
・項目2： 正常な形式で同じ行にある

カテゴリ: AI・機械学習

タグ: AI, テスト`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('テスト要約');
      expect(result.detailedSummary).toContain('・項目1： 内容が次の行にある');
      expect(result.detailedSummary).toContain(
        '・項目2： 正常な形式で同じ行にある'
      );
      expect(result.detailedSummary).not.toMatch(/：\s*\n[^・]/);
    });

    it('should preserve blank lines between bullets', async () => {
      const input: SummaryProviderInput = {
        title: 'Test with blank lines',
        content: 'Test content',
        constraints: { maxHeadlineChars: 200, detailPolicy: 'medium' },
        requestId: 'test-blank',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const payload = makeTextPayload(
        `要約: テスト要約

詳細要約:
・項目1： 内容1

・項目2： 内容2

カテゴリ: AI・機械学習

タグ: AI`
      );

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload,
        latencyMs: 500,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.detailedSummary).toContain('・項目1： 内容1');
      expect(result.detailedSummary).toContain('・項目2： 内容2');
    });
  });
});
