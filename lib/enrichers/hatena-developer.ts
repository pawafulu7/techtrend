import { BaseContentEnricher } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';

/**
 * はてなDeveloper Blogのコンテンツエンリッチャー
 */
export class HatenaDeveloperContentEnricher extends BaseContentEnricher {
  /**
   * このエンリッチャーが処理可能なURLかどうかを判定
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'developer.hatenastaff.com');
  }

  /**
   * コンテンツを抽出するためのセレクタを定義
   * 優先度順に配列で指定
   */
  protected getContentSelectors(): string[] {
    return [
      '.entry-content',         // はてなブログ標準
      '.entry-body',           // エントリー本文
      '.entry-inner',          // エントリー内部
      '.hatena-module-body',   // はてなモジュール本文
      'article .content',      // article要素内のコンテンツ
      '.article-body',         // 記事本文
      'article',              // article要素全体
      '.post',                // 投稿全体
      'main'                  // main要素（フォールバック）
    ];
  }

  /**
   * 最小コンテンツ長の要件
   */
  protected getMinContentLength(): number {
    return 500; // RSSフィードが短い場合に備えて500文字以上を要求
  }
}