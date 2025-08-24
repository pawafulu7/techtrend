/**
 * InfoQ Japan Content Enricher
 * InfoQ Japan記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class InfoQEnricher extends BaseContentEnricher {
  /**
   * InfoQ JapanのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('infoq.com/jp') || 
           url.includes('infoq.jp');
  }

  /**
   * InfoQ Japanの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.error(`[InfoQEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // InfoQの記事構造に合わせたセレクタ
      const selectors = [
        // InfoQ特有のセレクタ
        '.article__content',
        '.article-content',
        '.news-content',
        '.text-content',
        'article .content',
        '.article-body',
        '#article-content',
        
        // より一般的なセレクタ
        'article',
        'main article',
        '.main-content',
        '[role="article"]',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[InfoQEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.error(`[InfoQEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.error(`[InfoQEnricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.error(`[InfoQEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[InfoQEnricher] Failed to enrich ${url}:`, error);
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
      '.container',
      '#content',
      'body .main',
    ];
    
    return this.sanitizeContent(html, selectors);
  }
}