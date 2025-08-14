/**
 * Google AI Blog Content Enricher
 * Google AI Blog記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class GoogleAIEnricher extends BaseContentEnricher {
  /**
   * Google AI BlogのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('blog.google') && 
           (url.includes('/technology/ai/') || 
            url.includes('/technology/google-deepmind/') ||
            url.includes('/technology/developers/'));
  }

  /**
   * Google AI Blogの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.log(`[GoogleAIEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Google Blogの記事構造に合わせたセレクタ
      const selectors = [
        // Google Blogの特有のセレクタ
        'article .blog-content',
        '.article-content',
        '.post-content',
        '.blog-post-content',
        '.rich-text',
        'article [itemprop="articleBody"]',
        '.blogv2-content',
        
        // より一般的なセレクタ
        'main article',
        'article main',
        '.content-wrapper',
        '#article-content',
        '.entry-content',
        'div[role="article"]',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[GoogleAIEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.log(`[GoogleAIEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.log(`[GoogleAIEnricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[GoogleAIEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[GoogleAIEnricher] Failed to enrich ${url}:`, error);
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
      '.post',
      '.blog-post',
    ];
    
    return this.sanitizeContent(html, selectors);
  }
}