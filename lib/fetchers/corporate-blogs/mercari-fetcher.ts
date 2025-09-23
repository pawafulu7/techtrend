import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * メルカリ Engineering Blog フェッチャー
 */
export class MercariFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://engineering.mercari.com/blog/feed.xml';
  }

  protected getCompanyName(): string {
    return 'メルカリ';
  }
}