import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import { logger, sanitizeError } from '@/lib/logger';

/**
 * マネーフォワード技術ブログのコンテンツエンリッチャー
 */
export class MoneyForwardContentEnricher extends BaseContentEnricher {
  /**
   * このエンリッチャーが処理可能なURLかどうかを判定
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'moneyforward-dev.jp');
  }

  /**
   * 記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);

      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);

      // マネーフォワードのブログ記事構造に対応したセレクタ（優先順位順）
      const selectors = [
        // はてなブログPro専用のセレクタ（最優先）
        '.entry-content',
        'div.entry-content',
        '.entry-body',
        'div.p-entry__body',
        '.hatenablog-entry',

        // 記事本文のセレクタ
        'article .content',
        '.article-body',
        '.article-content',
        '.post-content',
        '.post-body',
        'article.entry',
        'main article',
        'article',
        '.post',
        'main'
      ];

      const content = this.sanitizeContent(html, selectors);

      // コンテンツ取得結果の詳細ログ
      if (content && content.length > 0) {
        if (content.length < 500) {
          logger.warn({ url, contentLength: content.length, preview: content.substring(0, 200) }, 'MoneyForward: Content too short');
        } else {
          logger.debug({ url, contentLength: content.length }, 'MoneyForward: Content enriched successfully');
        }
        return { content, thumbnail };
      } else {
        logger.error({ url }, 'MoneyForward: No content extracted');

        // コンテンツが取得できなくてもサムネイルがあれば返す
        if (thumbnail) {
          return { content: null, thumbnail };
        }

        return null;
      }

    } catch (error) {
      logger.error({ url, error: sanitizeError(error) }, 'MoneyForward: Enrichment error');
      return null;
    }
  }
}