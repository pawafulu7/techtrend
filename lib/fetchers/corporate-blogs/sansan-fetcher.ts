import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * Sansan Builders Box フェッチャー
 */
export class SansanFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://buildersbox.corp-sansan.com/feed';
  }

  protected getCompanyName(): string {
    return 'Sansan';
  }
}