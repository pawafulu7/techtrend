import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * DeNA Engineering ブログフェッチャー
 */
export class DeNAFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://engineering.dena.com/blog/index.xml';
  }

  protected getCompanyName(): string {
    return 'DeNA';
  }
}