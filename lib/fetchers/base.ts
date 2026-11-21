import { Source } from '@/lib/prisma-exports';
import { FetchResult } from '@/types/fetchers';
import { logger } from '@/lib/cli/utils/logger';
import { stripHtmlTags } from '@/lib/utils/html-sanitizer';
import { isNonRetryableFetchError } from '@/lib/utils/url/safe-redirect';
import { findThumbnailInHtml } from './html-image';

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
      // 転送先の拒否や本文の大きさの上限など、やり直しても結果が変わらない取得の失敗は再試行しない
      if (retries > 0 && !isNonRetryableFetchError(_error)) {
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

  /** og:image を優先し、無ければ最初の img の src を返す（入力長に比例する計算量で読む） */
  protected extractThumbnail(html: string): string | null {
    return findThumbnailInHtml(html);
  }

  protected sanitizeText(text: string): string {
    // html-sanitizer.tsの安全な実装を使用
    return stripHtmlTags(text);
  }
}
