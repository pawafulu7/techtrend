import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * サイバーエージェント Developers Blog フェッチャー
 */
export class CyberAgentFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://developers.cyberagent.co.jp/blog/feed/';
  }

  protected getCompanyName(): string {
    return 'サイバーエージェント';
  }
}