import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * マネーフォワード Developers Blog フェッチャー
 */
export class MoneyForwardFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://moneyforward-dev.jp/feed';
  }

  protected getCompanyName(): string {
    return 'マネーフォワード';
  }
}