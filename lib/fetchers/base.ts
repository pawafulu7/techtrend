import { Source } from '@prisma/client';
import { FetchResult } from '@/types/fetchers';
import { logger } from '@/lib/cli/utils/logger';

export abstract class BaseFetcher {
  protected source: Source;
  protected maxRetries = 3;
  protected retryDelay = 1000; // ms

  constructor(source: Source) {
    this.source = source;
  }

  /**
   * Fetch implementation. Subclasses should implement this.
   */
  abstract fetch(): Promise<FetchResult>;

  /**
   * Backward-compat: internal fetch for tests that used fetchInternal().
   * Default implementation delegates to fetch().
   * Deprecated — prefer overriding fetch() directly.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async fetchInternal(): Promise<FetchResult> {
    return this.fetch();
  }

  /**
   * Backward-compat: safeFetch wrapper preserved for older tests.
   * It returns empty results if source is disabled and catches errors
   * to surface them via the errors array.
   * Deprecated — callers should call fetch() directly and handle errors.
   */
  async safeFetch(): Promise<FetchResult> {
    const errors: Error[] = [];
    try {
      // start log
      logger.info(`${this.source.name} から記事を取得中...`);
      if (!this.source.enabled) {
        logger.warn(`${this.source.name} は無効化されています`);
        return { articles: [], errors: [] };
      }
      const result = await this.fetchInternal();
      if (!result.articles || result.articles.length === 0) {
        logger.info(`${this.source.name}: 記事が見つかりませんでした`);
      } else {
        logger.success(`${this.source.name}: ${result.articles.length}件の記事を取得`);
      }
      return result;
    } catch (_error) {
      const err = _error instanceof Error ? _error : new Error(String(_error));
      logger.error(`${this.source.name} エラー:`, err);
      errors.push(err);
      return { articles: [], errors };
    }
  }

  protected async retry<T>(
    fn: () => Promise<T>,
    retries = this.maxRetries
  ): Promise<T> {
    try {
      return await fn();
    } catch (_error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.retry(fn, retries - 1);
      }
      throw _error;
    }
  }

  protected normalizeUrl(url: string): string {
    try {
      const normalized = new URL(url);
      return normalized.href;
    } catch {
      return url;
    }
  }

  protected extractThumbnail(html: string): string | null {
    // Simple OG image extraction
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
    if (ogImageMatch) {
      return ogImageMatch[1];
    }
    
    // Fallback to first img tag
    const imgMatch = html.match(/<img[^>]*src="([^"]+)"/);
    return imgMatch ? imgMatch[1] : null;
  }

  protected sanitizeText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}
