import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * はてな Developer Blog フェッチャー
 */
export class HatenaFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://developer.hatenastaff.com/feed';
  }

  protected getCompanyName(): string {
    return 'はてなDeveloper';
  }
}