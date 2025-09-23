import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * freee Developers Hub フェッチャー
 */
export class FreeeFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://developers.freee.co.jp/feed';
  }

  protected getCompanyName(): string {
    return 'freee';
  }
}