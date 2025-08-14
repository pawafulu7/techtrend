import { BaseContentEnricher } from './base';

/**
 * リクルート技術ブログのコンテンツエンリッチャー
 */
export class RecruitContentEnricher extends BaseContentEnricher {
  /**
   * このエンリッチャーが処理可能なURLかどうかを判定
   */
  canHandle(url: string): boolean {
    return url.includes('blog.recruit.co.jp/rtc/');
  }

  /**
   * コンテンツを抽出するためのセレクタを定義
   * 優先度順に配列で指定
   */
  protected getContentSelectors(): string[] {
    return [
      '.entry-content',      // WordPress標準
      '.post-content',       // 一般的なブログ
      '.article-content',    // 記事コンテンツ
      '.content-area',       // コンテンツエリア
      'article .body',       // article要素内のbody
      '.article-body',       // 記事本文
      'article',            // article要素全体
      '.post',              // 投稿全体
      'main'                // main要素（フォールバック）
    ];
  }

  /**
   * 最小コンテンツ長の要件
   */
  protected getMinContentLength(): number {
    return 500; // RSSフィードが短い場合に備えて500文字以上を要求
  }
}