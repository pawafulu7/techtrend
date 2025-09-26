import { GeminiSummaryAdapter } from '../gemini-summary-adapter';
import { GeminiTransport, TransportResult } from '../../transport/gemini-transport.interface';
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

  describe('正常系', () => {
    it('should successfully generate summary with all fields', async () => {
      const input: SummaryProviderInput = {
        title: 'Test Article',
        content: 'Test content for article',
        articleType: 'technical',
        tone: 'formal',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-123',
      };

      const mockPrompt = 'Generated prompt';
      mockPromptBuilder.buildPrompt.mockReturnValue(mockPrompt);

      const mockResponse: TransportResult = {
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
テスト記事の要約です。

詳細要約:
・概要：詳細な説明1
・技術仕様：詳細な説明2
・実装方法：詳細な説明3

カテゴリ:
プログラミング言語

タグ:
TypeScript, Node.js, Jest`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 1000,
        headers: {},
      };

      mockTransport.invoke.mockResolvedValue(mockResponse);

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('テスト記事の要約です。');
      expect(result.detailedSummary).toContain('・概要：詳細な説明1');
      expect(result.detailedSummary).toContain('・技術仕様：詳細な説明2');
      expect(result.detailedSummary).toContain('・実装方法：詳細な説明3');
      expect(result.category).toBe('プログラミング言語');
      expect(result.tags).toEqual(['TypeScript', 'Node.js', 'Jest']);
      expect(result.confidence).toBe(0.95);
      expect(result.rawResponse).toBe(mockResponse.payload);
    });

    it('should handle response without optional fields', async () => {
      const input: SummaryProviderInput = {
        title: 'Minimal Article',
        content: 'Minimal content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'short',
        },
        requestId: 'test-minimal',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const mockResponse: TransportResult = {
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
ミニマル記事

詳細要約:
・説明：詳細内容`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 800,
        headers: {},
      };

      mockTransport.invoke.mockResolvedValue(mockResponse);

      const result = await adapter.summarize(input);

      expect(result.headline).toBe('ミニマル記事');
      expect(result.detailedSummary).toContain('・説明：詳細内容');
      expect(result.category).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.confidence).toBe(0.95);
    });

    it('should calculate confidence based on finish reason', async () => {
      const input: SummaryProviderInput = {
        title: 'Test',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-conf',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      const mockResponse: TransportResult = {
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
テスト

詳細要約:
・内容：詳細`,
                  },
                ],
              },
              finishReason: 'MAX_TOKENS',
            },
          ],
        },
        latencyMs: 1200,
        headers: {},
      };

      mockTransport.invoke.mockResolvedValue(mockResponse);

      const result = await adapter.summarize(input);

      expect(result.confidence).toBe(0.7);
    });
  });

  describe('Transport連携', () => {
    it('should send correct transport request', async () => {
      const input: SummaryProviderInput = {
        title: 'Integration Test',
        content: 'Test content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'long',
        },
        requestId: 'test-transport',
      };

      const mockPrompt = 'Generated prompt for transport';
      mockPromptBuilder.buildPrompt.mockReturnValue(mockPrompt);

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
テスト

詳細要約:
・内容`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 500,
        headers: {},
      });

      await adapter.summarize(input);

      expect(mockTransport.invoke).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        body: {
          contents: [
            {
              parts: [{ text: mockPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        },
        requestId: 'test-transport',
        timeoutMs: 60000,
      });
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
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-custom',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
カスタムモデル

詳細要約:
・説明`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
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
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
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
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
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
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-no-candidates',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [],
        },
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed: No candidates in response'
      );
    });

    it('should throw error when headline is missing', async () => {
      const input: SummaryProviderInput = {
        title: 'Missing Headline',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-no-headline',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `詳細要約:
・説明：内容`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed: Failed to extract headline from response'
      );
    });

    it('should throw error when detailed summary is missing', async () => {
      const input: SummaryProviderInput = {
        title: 'Missing Detailed',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-no-detailed',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
ヘッドラインのみ`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 500,
        headers: {},
      });

      await expect(adapter.summarize(input)).rejects.toThrow(
        'Response parsing failed: Failed to extract detailed summary from response'
      );
    });
  });

  describe('レスポンスパース', () => {
    it('should parse multi-line detailed summary correctly', async () => {
      const input: SummaryProviderInput = {
        title: 'Multi-line Test',
        content: 'Content',
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-multiline',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
マルチライン要約

詳細要約:
・項目1：説明1
・項目2：説明2
・項目3：説明3

カテゴリ:
Web開発

タグ:
React, TypeScript`,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
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
        constraints: {
          maxHeadlineChars: 200,
          detailPolicy: 'medium',
        },
        requestId: 'test-tags',
      };

      mockPromptBuilder.buildPrompt.mockReturnValue('prompt');

      mockTransport.invoke.mockResolvedValue({
        status: 'ok',
        httpStatus: 200,
        payload: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `要約:
タグテスト

詳細要約:
・説明

タグ:
  TypeScript  ,  Node.js  ,  React  `,
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
        latencyMs: 600,
        headers: {},
      });

      const result = await adapter.summarize(input);

      expect(result.tags).toEqual(['TypeScript', 'Node.js', 'React']);
    });
  });
});