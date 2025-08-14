/**
 * Google Developers Blog Content Enricher
 * Google Developers Blog記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class GoogleDevEnricher extends BaseContentEnricher {
  /**
   * Google Developers BlogのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('developers.googleblog.com') || 
           url.includes('developer.chrome.com') ||
           url.includes('web.dev');
  }

  /**
   * Google Developers Blogの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.log(`[GoogleDevEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Google Developers Blogの記事構造に合わせたセレクタ
      const selectors = [
        // Google Developers Blog特有のセレクタ
        '.post-content',
        '.blog-content',
        '.article-content',
        '.devsite-article-body',
        '.post-body',
        'article .content',
        '.entry-content',
        
        // web.dev特有のセレクタ
        '.article',
        'main .wrapper',
        
        // より一般的なセレクタ
        'article',
        'main article',
        '.content',
        '[role="article"]',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[GoogleDevEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.log(`[GoogleDevEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.log(`[GoogleDevEnricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[GoogleDevEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[GoogleDevEnricher] Failed to enrich ${url}:`, error);
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
      'body article',
    ];
    
    return this.sanitizeContent(html, selectors);
  }
}