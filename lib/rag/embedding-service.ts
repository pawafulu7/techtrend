import OpenAI from 'openai';
import pLimit from 'p-limit';
import { logger, sanitizeError } from '@/lib/logger';
import { embeddingSchema } from './schemas';

/**
 * Embedding Service for RAG
 *
 * Generates vector embeddings using OpenAI API with:
 * - Concurrent request limiting (p-limit)
 * - Exponential backoff retry for rate limits
 * - Runtime validation for API responses
 * - Secure error handling (no API key leaks)
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:672-763
 */

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  batchSize: number;
  concurrency: number;
  maxRetries: number;
}

export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingConfig;
  private limit: ReturnType<typeof pLimit>;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.config = {
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10),
      concurrency: parseInt(process.env.EMBEDDING_CONCURRENCY || '5', 10),
      maxRetries: 5,
      ...config,
    };

    this.limit = pLimit(this.config.concurrency);
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Text to embed (will be trimmed)
   * @param retryCount - Internal retry counter (do not pass manually)
   * @returns Validated 1536-dimensional vector
   * @throws Error if embedding generation fails after max retries
   */
  async embedText(text: string, retryCount = 0): Promise<number[]> {
    return this.limit(async () => {
      const trimmedText = text.trim();

      if (!trimmedText) {
        throw new Error('Cannot embed empty text');
      }

      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: trimmedText,
        });

        const embedding = response.data[0].embedding;

        // Runtime validation (protect against API anomalies)
        // - Enforce 1536 dimensions
        // - Ensure all values are finite numbers
        // - Ensure values are normalized (abs <= 1)
        const validated = embeddingSchema.parse(embedding);

        return validated;
      } catch (error) {
        // Handle rate limiting with exponential backoff
        if (this.shouldRetry(error, retryCount)) {
          const backoffMs = this.calculateBackoff(retryCount, error);

          logger.warn(
            {
              attempt: retryCount + 1,
              maxRetries: this.config.maxRetries,
              backoffMs,
              errorType:
                error instanceof Error ? error.constructor.name : 'Unknown',
            },
            'Rate limited or transient error, retrying'
          );

          await this.sleep(backoffMs);
          return this.embedText(text, retryCount + 1);
        }

        // Log error without exposing API key
        logger.error(
          {
            error: sanitizeError(error),
            textLength: trimmedText.length,
            textPreview: trimmedText.substring(0, 50),
            model: this.config.model,
          },
          'Embedding generation failed'
        );

        throw error;
      }
    });
  }

  /**
   * Generate embeddings for multiple texts using a single API call per batch
   *
   * Uses OpenAI Embeddings API batch input (string[]) to minimize API calls.
   * Splits into chunks of `batchSize` when input exceeds the limit.
   *
   * @param texts - Array of texts to embed
   * @returns Array of validated vectors (same order as input)
   * @throws Error if any text is empty or embedding generation fails after max retries
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Validate upfront: reject any empty strings (same behaviour as embedText)
    for (const text of texts) {
      if (!text.trim()) {
        throw new Error('Cannot embed empty text');
      }
    }

    // Split into chunks of batchSize
    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      chunks.push(texts.slice(i, i + this.config.batchSize));
    }

    // Process chunks in parallel (p-limit inside embedChunk controls API concurrency)
    const chunkResults = await Promise.all(
      chunks.map((chunk) => this.embedChunk(chunk))
    );

    return chunkResults.flat();
  }

  /**
   * Send a single batch API call for a chunk of texts with retry logic
   *
   * @param texts - Texts to embed (must be non-empty strings, length <= batchSize)
   * @param retryCount - Internal retry counter (do not pass manually)
   */
  private async embedChunk(
    texts: string[],
    retryCount = 0
  ): Promise<number[][]> {
    return this.limit(async () => {
      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: texts,
        });

        // Sort by index to guarantee order matches input
        const sorted = response.data.sort((a, b) => a.index - b.index);

        return sorted.map((item) => embeddingSchema.parse(item.embedding));
      } catch (error) {
        if (this.shouldRetry(error, retryCount)) {
          const backoffMs = this.calculateBackoff(retryCount, error);

          logger.warn(
            {
              attempt: retryCount + 1,
              maxRetries: this.config.maxRetries,
              backoffMs,
              batchSize: texts.length,
              errorType:
                error instanceof Error ? error.constructor.name : 'Unknown',
            },
            'Rate limited or transient error on batch, retrying'
          );

          await this.sleep(backoffMs);
          return this.embedChunk(texts, retryCount + 1);
        }

        logger.error(
          {
            error: sanitizeError(error),
            batchSize: texts.length,
            model: this.config.model,
          },
          'Batch embedding generation failed'
        );

        throw error;
      }
    });
  }

  /**
   * Determine if error should be retried
   *
   * Retry on:
   * - 429 (rate limit)
   * - 5xx (server errors)
   * - Network errors
   *
   * Do NOT retry on:
   * - 4xx (except 429) - client errors
   * - Validation errors
   */
  private shouldRetry(error: unknown, retryCount: number): boolean {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      // Retry on 429 (rate limit) or 5xx (server errors)
      return status === 429 || (status !== undefined && status >= 500);
    }

    // Retry on network errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      );
    }

    return false;
  }

  /**
   * Calculate backoff time with exponential backoff + jitter
   *
   * Respects Retry-After header if present
   */
  private calculateBackoff(retryCount: number, error: unknown): number {
    // Check for Retry-After header
    if (error instanceof OpenAI.APIError && error.headers?.['retry-after']) {
      const retryAfter = parseInt(error.headers['retry-after'], 10);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000; // Convert to ms
      }
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 10s)
    const exponentialMs = Math.min(1000 * Math.pow(2, retryCount), 10000);

    // Add jitter (0-1s random)
    const jitter = Math.random() * 1000;

    return exponentialMs + jitter;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
