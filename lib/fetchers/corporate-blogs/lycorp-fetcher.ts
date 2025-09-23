import { BaseCorporateFetcher } from './base-corporate-fetcher';

/**
 * LY Corporation Tech Blog (旧LINE/Yahoo) フェッチャー
 */
export class LYCorpFetcher extends BaseCorporateFetcher {
  protected getRssUrl(): string {
    return 'https://techblog.lycorp.co.jp/ja/feed/index.xml';
  }

  protected getCompanyName(): string {
    return 'LINEヤフー';
  }

  protected getNormalizedCompanyName(): string {
    // データベースの既存タグに合わせる
    return 'LINEヤフー';
  }
}