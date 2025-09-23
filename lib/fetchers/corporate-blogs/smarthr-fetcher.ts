import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * SmartHR Tech Blog フェッチャー
 */
export class SmartHRFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://tech.smarthr.jp/feed';
  }

  protected getCompanyName(): string {
    return 'SmartHR';
  }
}