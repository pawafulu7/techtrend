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

    it('should handle rate limit errors with longer delay', async () => {
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
        .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const startTime = Date.now();
      const pipeline = new LLMExtractionPipeline();
      await pipeline.extract({ test: 'input' }, testConfig, {
        maxRetries: 2,
        retryDelayMs: 50,
      });
      const elapsed = Date.now() - startTime;

      // Rate limit should use 3x delay
      expect(elapsed).toBeGreaterThanOrEqual(100);
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
