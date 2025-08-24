import { BaseContentEnricher, EnrichedContent } from './base';

/**
 * マネーフォワード技術ブログのコンテンツエンリッチャー
 */
export class MoneyForwardContentEnricher extends BaseContentEnricher {
  /**
   * このエンリッチャーが処理可能なURLかどうかを判定
   */
  canHandle(url: string): boolean {
    return url.includes('moneyforward-dev.jp');
  }

  /**
   * 記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.error(`[MoneyForward Enricher] Starting enrichment for: ${url}`);
      
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
      
      // コンテンツ取得結果のログ
      if (content && content.length > 0) {
        console.error(`[MoneyForward Enricher] Content extracted: ${content.length} characters`);
        
        // 最小限のコンテンツチェック（200文字以上あれば有効とする）
        if (content.length < 200) {
          console.warn(`[MoneyForward Enricher] Content seems too short (${content.length} chars), but returning anyway`);
        }
        
        return { content, thumbnail };
      } else {
        console.error(`[MoneyForward Enricher] No content could be extracted from ${url}`);
        
        // コンテンツが取得できなくてもサムネイルがあれば返す
        if (thumbnail) {
          console.error(`[MoneyForward Enricher] No content but thumbnail found`);
          return { content: null, thumbnail };
        }
        
        return null;
      }
      
    } catch (error) {
      console.error(`[MoneyForward Enricher] Failed to enrich ${url}:`, error);
      return null;
    }
  }
}