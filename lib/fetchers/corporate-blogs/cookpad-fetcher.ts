import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * クックパッド開発者ブログ フェッチャー
 */
export class CookpadFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://techlife.cookpad.com/rss';
  }

  protected getCompanyName(): string {
    return 'クックパッド';
  }
}