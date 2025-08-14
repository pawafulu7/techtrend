/**
 * Publickey Content Enricher
 * Publickey記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class PublickeyEnricher extends BaseContentEnricher {
  /**
   * PublickeyのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('publickey1.jp') || 
           url.includes('publickey2.jp');
  }

  /**
   * Publickeyの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.log(`[PublickeyEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Publickeyの記事構造に合わせたセレクタ
      const selectors = [
        // Publickey特有のセレクタ
        '.entry-content',
        'article .entry-content',
        '.post-content',
        '.article-body',
        'div.content',
        '.main-content article',
        '#main article',
        
        // より一般的なセレクタ
        'article',
        'main article',
        '.content',
        '[role="main"] article',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[PublickeyEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.log(`[PublickeyEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.log(`[PublickeyEnricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[PublickeyEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[PublickeyEnricher] Failed to enrich ${url}:`, error);
      return null;
    }
  }

  /**
   * より広範囲から本文を抽出（フォールバック）
   */
  private extractWithFallback(html: string): string {
    const selectors = [
      // 記事本文を含む可能性が高い要素
      'main',
      '#main',
      '.main',
      '#content',
      'body article',
    ];
    
    return this.sanitizeContent(html, selectors);
  }
}