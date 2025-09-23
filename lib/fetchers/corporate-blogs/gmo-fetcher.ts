import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * GMOデベロッパーズ フェッチャー
 */
export class GMOFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://developers.gmo.jp/feed/';
  }

  protected getCompanyName(): string {
    return 'GMO';
  }
}