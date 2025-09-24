/**
 * Qiita AI Content Enricher
 * Qiita AI関連記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';

export class QiitaAIEnricher extends BaseContentEnricher {
  /**
   * QiitaのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'qiita.com') && url.includes('/items/');
  }

  /**
   * Qiitaの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);

      // Qiitaの記事構造に合わせたセレクタ
      const selectors = [
        // Qiita特有のセレクタ
        '.it-MdContent',  // Qiitaのメインコンテンツクラス
        '.p-items_main',
        'section.it-MdContent',
        'article[itemprop="articleBody"]',
        '.markdownContent',

        // より一般的なセレクタ
        'article',
        '.content',
        '.post-content',
        '.entry-content',
        'main article',
      ];

      const content = this.sanitizeContent(html, selectors);

      // コンテンツが取得できたか確認（Qiitaは通常長い記事が多いので1000文字以上）
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
      '.p-items_body',
      'article',
      'main',
      '[role="main"]',
      '.container article',
    ];

    return this.sanitizeContent(html, selectors);
  }
}