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
      console.log(`[MoneyForward Enricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // マネーフォワードのブログ記事構造に対応したセレクタ
      const selectors = [
        // はてなブログ系のセレクタ
        '.entry-content',
        '.entry-body',
        'div.p-entry__body',
        '.hatenablog-entry',
        
        // 一般的な記事セレクタ
        'article .content',
        '.article-body',
        '.article-content',
        '.post-content',
        '.post-body',
        'main article',
        'article',
        '.post',
        'main'
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認（500文字以上）
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[MoneyForward Enricher] Content too short (${content.length} chars) for ${url}`);
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.log(`[MoneyForward Enricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[MoneyForward Enricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[MoneyForward Enricher] Failed to enrich ${url}:`, error);
      return null;
    }
  }
}