import { Source } from '@prisma/client';
import { CreateArticleInput, FetchResult } from '@/types/fetchers';
import { ExternalAPIError } from '@/lib/errors';
import { logger } from '@/lib/cli/utils/logger';

export abstract class BaseFetcher {
  protected source: Source;
  protected maxRetries = 3;
  protected retryDelay = 1000; // ms

  constructor(source: Source) {
    this.source = source;
  }

  abstract fetch(): Promise<FetchResult>;

  /**
   * 共通のfetchラッパー - エラーハンドリングとログを統一
   */
  protected async safeFetch(): Promise<FetchResult> {
    const errors: Error[] = [];
    const articles: CreateArticleInput[] = [];

    try {
      logger.info(`${this.source.name} から記事を取得中...`);
      
      // ソースが無効化されている場合は早期リターン
      if (!this.source.enabled) {
        logger.warn(`${this.source.name} は無効化されています`);
        return { articles: [], errors: [] };
      }

      const result = await this.fetchInternal();
      
      if (result.articles.length === 0) {
        logger.info(`${this.source.name}: 記事が見つかりませんでした`);
      } else {
        logger.success(`${this.source.name}: ${result.articles.length}件の記事を取得`);
      }
      
      return result;
    } catch (_error) {
      const err = error instanceof Error 
        ? new ExternalAPIError(this.source.name, error.message, error)
        : new ExternalAPIError(this.source.name, String(error));
      logger.error(`${this.source.name} エラー:`, err);
      errors.push(err);
      return { articles, errors };
    }
  }

  /**
   * 各フェッチャーが実装する内部fetchメソッド
   */
  protected abstract fetchInternal(): Promise<FetchResult>;

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
      throw error;
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