/**
 * LLM Extraction Pipeline
 *
 * Generic pipeline for extracting structured data from LLM responses with:
 * - Zod schema validation
 * - Retry logic with exponential backoff
 * - Model and prompt version tracking
 * - Batch processing support
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { BatchExecutor, BatchJob } from './batch-executor';
import { env } from '@/lib/config/env';

// Types
export interface ExtractionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ExtractionResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  modelVersion: string;
  promptVersion: string;
  rawResponse?: string;
}

export interface ExtractionConfig<T> {
  // Input type widened to `any` to accept ZodObjects with .transform() (ZodEffects)
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  promptVersion: string;
  buildPrompt: (input: unknown) => string;
  parseResponse: (text: string) => T;
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxRetries: 3,
  retryDelayMs: 5000,
  temperature: 0.3,
  maxOutputTokens: 2500,
};

/**
 * LLM Extraction Pipeline
 */
export class LLMExtractionPipeline {
  private apiKey: string;
  private apiUrl: string;
  private modelVersion: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.modelVersion = model || env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    // API key is passed via x-goog-api-key header for security (not in URL)
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelVersion}:generateContent`;
  }

  /**
   * Extract structured data using LLM
   */
  async extract<T>(
    input: unknown,
    config: ExtractionConfig<T>,
    options?: ExtractionOptions
  ): Promise<ExtractionResult<T>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const shouldLogRaw = env.LOG_LLM_RAW_RESPONSE === 'true';
    const prompt = config.buildPrompt(input);

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      rawResponse = undefined; // attemptごとにリセット
      try {
        rawResponse = await this.callAPI(prompt, opts);

        // Parse the response
        const parsed = config.parseResponse(rawResponse);

        // Validate with Zod schema
        const validated = config.schema.parse(parsed);

        return {
          success: true,
          data: validated,
          modelVersion: this.modelVersion,
          promptVersion: config.promptVersion,
          rawResponse,
        };
      } catch (error) {
        lastError = error as Error;

        logger.warn(
          {
            attempt,
            maxRetries: opts.maxRetries,
            errorMessage: lastError.message,
            rawResponse: shouldLogRaw ? rawResponse?.slice(0, 300) : undefined,
          },
          'LLM extraction attempt failed'
        );

        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          await this.delay(opts.retryDelayMs * 3);
        } else if (attempt < opts.maxRetries) {
          // Exponential backoff
          await this.delay(opts.retryDelayMs * Math.pow(2, attempt - 1));
        }
      }
    }

    logger.error(
      {
        errorMessage: lastError?.message,
        rawResponse,
      },
      'LLM extraction failed after all retries'
    );

    return {
      success: false,
      data: null,
      error: lastError?.message || 'Unknown error',
      modelVersion: this.modelVersion,
      promptVersion: config.promptVersion,
      rawResponse,
    };
  }

  /**
   * Batch extract with concurrency control using BatchExecutor
   */
  async batchExtract<T, I>(
    inputs: I[],
    config: ExtractionConfig<T>,
    options?: ExtractionOptions & { concurrency?: number }
  ): Promise<ExtractionResult<T>[]> {
    const concurrency = options?.concurrency || 3;

    // Create BatchExecutor for consistent batch processing
    const executor = new BatchExecutor({
      concurrency,
      delayBetweenBatchesMs: 1000,
    });

    // Convert inputs to BatchJob format
    const jobs: BatchJob<I>[] = inputs.map((input, index) => ({
      id: `extraction-${index}`,
      input,
    }));

    // Process with BatchExecutor
    const summary = await executor.execute(jobs, async (job) => {
      return this.extract(job.input, config, options);
    });

    // Extract results in order
    return summary.results.map((r) => {
      if (r.success && r.result) {
        return r.result;
      }
      // Return error result for failed jobs
      return {
        success: false,
        data: null,
        error: r.error || 'Batch processing failed',
        modelVersion: this.modelVersion,
        promptVersion: config.promptVersion,
      };
    });
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return this.modelVersion;
  }

  /**
   * Extract raw text without schema validation
   * For simple use cases like text shortening
   */
  async extractRaw(
    prompt: string,
    options?: ExtractionOptions
  ): Promise<{
    success: boolean;
    text: string | null;
    error?: string;
    modelVersion: string;
  }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const text = await this.callAPI(prompt, opts);
      return {
        success: true,
        text: text.trim(),
        modelVersion: this.modelVersion,
      };
    } catch (error) {
      logger.error(
        { errorMessage: (error as Error).message },
        'LLM raw extraction failed'
      );
      return {
        success: false,
        text: null,
        error: (error as Error).message,
        modelVersion: this.modelVersion,
      };
    }
  }

  /**
   * Call Gemini API
   */
  private async callAPI(
    prompt: string,
    opts: Required<ExtractionOptions>
  ): Promise<string> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
          topP: 0.8,
          topK: 40,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new Error('Empty response from API');
    }

    return text;
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('429') ||
      message.includes('rate') ||
      message.includes('quota') ||
      message.includes('503')
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let instance: LLMExtractionPipeline | null = null;

export function getLLMExtractionPipeline(): LLMExtractionPipeline {
  if (!instance) {
    instance = new LLMExtractionPipeline();
  }
  return instance;
}

// For testing
export function resetLLMExtractionPipeline(): void {
  instance = null;
}
