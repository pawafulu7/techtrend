import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * ZOZO TECH BLOG フェッチャー
 */
export class ZOZOFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://techblog.zozo.com/rss';
  }

  protected getCompanyName(): string {
    return 'ZOZO';
  }
}