import { z } from 'zod';
import {
  LLMExtractionPipeline,
  ExtractionConfig,
  resetLLMExtractionPipeline,
} from '@/lib/ai/extraction/llm-extraction-pipeline';
import { resetEnvCache } from '@/lib/config/env';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('LLMExtractionPipeline', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetLLMExtractionPipeline();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-api-key' };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  describe('constructor', () => {
    it('should throw if API key is not provided', () => {
      delete process.env.GEMINI_API_KEY;
      resetEnvCache();
      expect(() => new LLMExtractionPipeline()).toThrow(
        'GEMINI_API_KEY is not set'
      );
    });

    it('should accept API key as parameter', () => {
      delete process.env.GEMINI_API_KEY;
      resetEnvCache();
      const pipeline = new LLMExtractionPipeline('custom-api-key');
      expect(pipeline.getModelVersion()).toBe('gemini-2.5-flash-lite');
    });

    it('should use custom model', () => {
      const pipeline = new LLMExtractionPipeline('test-key', 'custom-model');
      expect(pipeline.getModelVersion()).toBe('custom-model');
    });
  });

  describe('extract', () => {
    const testSchema = z.object({
      result: z.string(),
      count: z.number(),
    });

    const testConfig: ExtractionConfig<z.infer<typeof testSchema>> = {
      schema: testSchema,
      promptVersion: '1.0',
      buildPrompt: (input: unknown) => `Process: ${JSON.stringify(input)}`,
      parseResponse: (text: string) => JSON.parse(text),
    };

    it('should extract and validate data successfully', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: '{"result": "success", "count": 42}' }],
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const pipeline = new LLMExtractionPipeline();
      const result = await pipeline.extract({ test: 'input' }, testConfig);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success', count: 42 });
      expect(result.modelVersion).toBe('gemini-2.5-flash-lite');
      expect(result.promptVersion).toBe('1.0');
    });

    it('should return error on validation failure', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: '{"result": "success", "count": "not a number"}' },
              ],
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const pipeline = new LLMExtractionPipeline();
      const result = await pipeline.extract({ test: 'input' }, testConfig, {
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should retry on API failure', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: '{"result": "success", "count": 1}' }],
            },
          },
        ],
      };

      mockFetch
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const pipeline = new LLMExtractionPipeline();
      const result = await pipeline.extract({ test: 'input' }, testConfig, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // API はエラーの本文に種類に関わらず generativelanguage.googleapis.com を入れ、パイプラインは
    // 「API request failed: <status> - <本文>」で投げる。'rate' の部分一致で判定しないことを、
    // 待つ時間（retryDelayMs の 3 倍か、指数バックオフの 1 回目か）で確かめる
    it.each([
      [
        '429 は Rate Limit として 3 倍待つ',
        429,
        '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
        150,
      ],
      [
        '本文に generativelanguage を含む 400 は、通常の間隔で待つ',
        400,
        '{"error":{"status":"INVALID_ARGUMENT","details":[{"metadata":{"service":"generativelanguage.googleapis.com"}}]}}',
        50,
      ],
    ])('%s', async (_label, status, body, expectedDelay) => {
      const delay = jest
        .spyOn(LLMExtractionPipeline.prototype as any, 'delay')
        .mockResolvedValue(undefined);
      const mockResponse = {
        candidates: [
          {
            content: { parts: [{ text: '{"result": "success", "count": 1}' }] },
          },
        ],
      };
      mockFetch
        .mockResolvedValueOnce({ ok: false, status, text: async () => body })
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

      try {
        const pipeline = new LLMExtractionPipeline();
        const result = await pipeline.extract({ test: 'input' }, testConfig, {
          maxRetries: 2,
          retryDelayMs: 50,
        });

        expect(result.success).toBe(true);
        expect(delay).toHaveBeenCalledTimes(1);
        expect(delay).toHaveBeenCalledWith(expectedDelay);
      } finally {
        delay.mockRestore();
      }
    });

    it('最後の試行の後は、Rate Limit でも待たずに失敗を返す', async () => {
      const delay = jest
        .spyOn(LLMExtractionPipeline.prototype as any, 'delay')
        .mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"error":{"status":"RESOURCE_EXHAUSTED"}}',
      });

      try {
        const pipeline = new LLMExtractionPipeline();
        const result = await pipeline.extract({ test: 'input' }, testConfig, {
          maxRetries: 1,
          retryDelayMs: 50,
        });

        expect(result.success).toBe(false);
        expect(delay).not.toHaveBeenCalled();
      } finally {
        delay.mockRestore();
      }
    });

    it('should return raw response on failure for debugging', async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'invalid json response' }],
            },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const pipeline = new LLMExtractionPipeline();
      const result = await pipeline.extract({ test: 'input' }, testConfig, {
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.rawResponse).toBe('invalid json response');
    });
  });

  describe('batchExtract', () => {
    const testSchema = z.object({ value: z.number() });

    const testConfig: ExtractionConfig<z.infer<typeof testSchema>> = {
      schema: testSchema,
      promptVersion: '1.0',
      buildPrompt: (input: unknown) => `Value: ${input}`,
      parseResponse: (text: string) => JSON.parse(text),
    };

    it('should process multiple inputs with concurrency', async () => {
      const mockResponse = (value: number) => ({
        candidates: [
          {
            content: {
              parts: [{ text: `{"value": ${value}}` }],
            },
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse(1) })
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse(2) })
        .mockResolvedValueOnce({ ok: true, json: async () => mockResponse(3) });

      const pipeline = new LLMExtractionPipeline();
      const results = await pipeline.batchExtract([1, 2, 3], testConfig, {
        concurrency: 2,
      });

      expect(results.length).toBe(3);
      expect(results.filter((r) => r.success).length).toBe(3);
    });
  });
});
