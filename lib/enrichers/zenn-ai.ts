/**
 * Zenn AI Content Enricher
 * Zenn AI関連記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';

export class ZennAIEnricher extends BaseContentEnricher {
  /**
   * ZennのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'zenn.dev') && url.includes('/articles/');
  }

  /**
   * Zennの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);

      // Zennの記事構造に合わせたセレクタ
      const selectors = [
        // Zenn特有のセレクタ
        'article .znc', // Zenn記事のメインコンテンツクラス
        '.article-content',
        'article[itemprop="articleBody"]',
        'div[class*="ArticleContent"]',
        'main article',
        'article main',

        // より一般的なセレクタ
        'article',
        '.content',
        '.post-content',
        '.entry-content',
      ];

      const content = this.sanitizeContent(html, selectors);

      // コンテンツが取得できたか確認（Zennは通常長い記事が多いので1000文字以上）
      if (!this.isContentSufficient(content, 1000)) {
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 1000)) {
          return { content: fallbackContent, thumbnail };
        }

        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          return { content: content || null, thumbnail };
        }

        return null;
      }

      return { content, thumbnail };

    } catch (_error) {
      return null;
    }
  }

  /**
   * より広範囲から本文を抽出（フォールバック）
   */
  private extractWithFallback(html: string): string {
    const selectors = [
      // 記事本文を含む可能性が高い要素
      'article',
      'main',
      '[role="main"]',
      '.container article',
      'section[class*="Article"]',
    ];

    return this.sanitizeContent(html, selectors);
  }
}