import { Source } from '@prisma/client';
import { FetchResult } from '@/types/fetchers';

export abstract class BaseFetcher {
  protected source: Source;
  protected maxRetries = 3;
  protected retryDelay = 1000; // ms

  constructor(source: Source) {
    this.source = source;
  }

  abstract fetch(): Promise<FetchResult>;

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
