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
  schema: z.ZodType<T>;
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
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.modelVersion =
      model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelVersion}:generateContent?key=${this.apiKey}`;
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
    const prompt = config.buildPrompt(input);

    let lastError: Error | null = null;
    let rawResponse: string | undefined;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
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
            error: lastError.message,
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
        error: lastError?.message,
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
   * Batch extract with concurrency control
   */
  async batchExtract<T, I>(
    inputs: I[],
    config: ExtractionConfig<T>,
    options?: ExtractionOptions & { concurrency?: number }
  ): Promise<ExtractionResult<T>[]> {
    const concurrency = options?.concurrency || 3;
    const results: ExtractionResult<T>[] = [];

    // Process in batches
    for (let i = 0; i < inputs.length; i += concurrency) {
      const batch = inputs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((input) => this.extract(input, config, options))
      );
      results.push(...batchResults);

      // Add delay between batches to avoid rate limiting
      if (i + concurrency < inputs.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Get model version
   */
  getModelVersion(): string {
    return this.modelVersion;
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
      headers: { 'Content-Type': 'application/json' },
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
