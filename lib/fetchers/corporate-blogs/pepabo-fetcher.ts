import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * GMOペパボ テックブログ フェッチャー
 */
export class PepaboFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://tech.pepabo.com/feed.rss';
  }

  protected getCompanyName(): string {
    return 'GMOペパボ';
  }
}