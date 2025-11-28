/**
 * Zenn API Client Service
 *
 * Provides functionality to fetch article content from Zenn's public API.
 * Implements rate limiting, retry logic with exponential backoff, and comprehensive error handling.
 */

import { logger } from '@/lib/logger';

export interface ZennArticleResponse {
  article: {
    id: number;
    title: string;
    slug: string;
    path?: string;
    body_html: string;
    body_markdown?: string;
    body_letters_count: number;
    published_at: string;
    body_updated_at: string;
    topics: string[];
    liked_count: number;
    bookmarked_count: number;
    article_type: string;
    user: {
      username: string;
      avatar_small_url: string;
    };
  };
}

/**
 * Rate limiter for Zenn API requests
 * Implements sliding window rate limiting to prevent API abuse
 */
class RateLimiter {
  private static readonly MAX_RPS = 3; // Conservative: 3 requests/sec
  private static lastRequestTime = 0;
  private static requestCount = 0;
  private static mutex: Promise<void> = Promise.resolve();

  /**
   * Wait if necessary to respect rate limit
   * Thread-safe implementation using mutex
   */
  static async waitIfNeeded(): Promise<void> {
    await this.mutex;

    this.mutex = (async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;

      if (elapsed < 1000) {
        this.requestCount++;
        if (this.requestCount >= this.MAX_RPS) {
          const wait = 1000 - elapsed;
          const jitter = Math.floor(Math.random() * 200) + 100; // 100-300ms jitter
          await new Promise(resolve => setTimeout(resolve, wait + jitter));
          this.requestCount = 1; // Count the request that triggered the wait
        }
      } else {
        this.requestCount = 1;
      }

      this.lastRequestTime = Date.now();
    })();
  }
}

/**
 * Zenn Service
 * Handles all interactions with Zenn API
 */
export class ZennService {
  private static readonly BASE_URL = 'https://zenn.dev/api/articles';
  private static readonly REQUEST_TIMEOUT = 8000; // 8 seconds per request
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_RETRY_DELAY = 1000; // 1 second
  private static readonly MAX_TOTAL_DURATION = 25000; // 25 seconds total budget

  /**
   * Extract article slug from Zenn URL
   * @param url - Zenn article URL
   * @returns Article slug or null if invalid
   */
  static extractSlugFromUrl(url: string): string | null {
    try {
      // Remove trailing slash and handle query params/hash
      const cleanUrl = url.trim().replace(/\/$/, '');
      const match = cleanUrl.match(/zenn\.dev\/[^/]+\/articles\/([a-z0-9_-]+)(?:[?#].*)?$/i);

      if (!match) {
        logger.debug('Failed to extract slug from URL', { url });
        return null;
      }

      return match[1];
    } catch (error) {
      logger.error('Error extracting slug from URL', { url, error });
      return null;
    }
  }

  /**
   * Fetch article content from Zenn API
   * @param slug - Article slug
   * @returns Article data
   * @throws Error if fetch fails
   */
  static async fetchArticleContent(slug: string): Promise<ZennArticleResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);
    const startTime = Date.now();

    try {
      await RateLimiter.waitIfNeeded();

      const response = await fetch(`${this.BASE_URL}/${slug}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TechTrend/1.0',
          'Accept': 'application/json',
        },
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).status = response.status;
        (error as any).statusText = response.statusText;
        (error as any).duration = duration;
        (error as any).headers = response.headers; // Attach headers for Retry-After
        throw error;
      }

      // Validate Content-Type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Invalid Content-Type: ${contentType}`);
      }

      const data: ZennArticleResponse = await response.json();

      // Validate response structure
      if (!data.article || !data.article.body_html) {
        throw new Error('Invalid response: missing article.body_html');
      }

      logger.info('Successfully fetched Zenn article', {
        slug,
        status: response.status,
        duration_ms: duration,
        content_length: data.article.body_html.length,
      });

      return data;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Handle timeout
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout');
        (timeoutError as any).isTimeout = true;
        (timeoutError as any).duration = duration;
        throw timeoutError;
      }

      // Attach duration to error
      if (!error.duration) {
        (error as any).duration = duration;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      // Abort any pending request to prevent leaks
      controller.abort();
    }
  }

  /**
   * Fetch article content with retry logic
   * Implements exponential backoff with jitter
   *
   * @param slug - Article slug
   * @returns Article data
   * @throws Error if all retries fail
   */
  static async fetchWithRetry(slug: string): Promise<ZennArticleResponse> {
    const overallStartTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      // Check overall timeout budget
      const elapsed = Date.now() - overallStartTime;
      if (elapsed >= this.MAX_TOTAL_DURATION) {
        logger.error('Total timeout budget exceeded for Zenn article fetch', {
          slug,
          elapsed_ms: elapsed,
          max_duration_ms: this.MAX_TOTAL_DURATION,
        });
        throw new Error(`Total timeout exceeded: ${elapsed}ms > ${this.MAX_TOTAL_DURATION}ms`);
      }

      try {
        const data = await this.fetchArticleContent(slug);

        if (attempt > 1) {
          logger.info('Zenn article fetch succeeded after retry', {
            slug,
            attempt,
            total_duration_ms: Date.now() - overallStartTime,
          });
        }

        return data;
      } catch (error: any) {
        lastError = error;
        const status = error.status;
        const isTimeout = error.isTimeout;
        const isNetworkError = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);

        // Determine if we should retry
        const shouldRetry =
          status === 429 ||
          (status >= 500 && status < 600) ||
          isTimeout ||
          isNetworkError;

        if (!shouldRetry) {
          // Non-retryable errors: 4xx (except 429), invalid JSON, etc.
          // Use warn/info for expected errors (404/410)
          const logLevel = status === 404 || status === 410 ? 'info' : 'warn';
          logger[logLevel]('Non-retryable error fetching Zenn article', {
            slug,
            status,
            error: error.message,
            attempt,
            duration_ms: error.duration,
          });
          throw error;
        }

        // Log retry attempt
        logger.warn('Retryable error fetching Zenn article', {
          slug,
          status,
          error: error.message,
          attempt,
          max_retries: this.MAX_RETRIES,
          will_retry: attempt < this.MAX_RETRIES,
          duration_ms: error.duration,
        });

        // Don't wait after last attempt
        if (attempt >= this.MAX_RETRIES) {
          break;
        }

        // Calculate retry delay with exponential backoff + jitter
        let delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        // Honor Retry-After header for 429
        if (status === 429) {
          const retryAfter = error.headers?.get?.('retry-after');
          if (retryAfter) {
            const retryAfterMs = parseInt(retryAfter, 10) * 1000;
            if (!isNaN(retryAfterMs)) {
              delay = retryAfterMs;
              logger.info('Using Retry-After header for backoff', {
                slug,
                retry_after_ms: delay,
              });
            }
          }
        }

        // Add jitter (100-300ms)
        const jitter = Math.floor(Math.random() * 200) + 100;
        const totalDelay = delay + jitter;

        logger.debug('Waiting before retry', {
          slug,
          attempt,
          delay_ms: totalDelay,
        });

        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }

    // All retries exhausted
    logger.error('All retries exhausted for Zenn article fetch', {
      slug,
      attempts: this.MAX_RETRIES,
      last_error: lastError?.message,
      total_duration_ms: Date.now() - overallStartTime,
    });

    throw new Error(`All retries exhausted: ${lastError?.message ?? 'unknown error'}`);
  }

  /**
   * Check if a URL is a Zenn article URL
   * @param url - URL to check
   * @returns True if URL is a Zenn article
   */
  static isZennArticleUrl(url: string): boolean {
    return url.includes('zenn.dev') && url.includes('/articles/');
  }
}
