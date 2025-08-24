/**
 * Stack Overflow Blog Content Enricher
 * Stack Overflow Blog記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class StackOverflowEnricher extends BaseContentEnricher {
  /**
   * Stack Overflow BlogのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('stackoverflow.blog') || 
           url.includes('stackexchange.com/blog');
  }

  /**
   * Stack Overflow Blogの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Stack Overflow Blogの記事構造に合わせたセレクタ
      const selectors = [
        // Stack Overflow Blog特有のセレクタ
        '.js-post-body',
        '.post-content',
        '.article-content',
        '.blog-post-content',
        'article .prose',
        '.prose-content',
        '#post-content',
        
        // より一般的なセレクタ
        'article',
        'main article',
        '.content',
        '[role="article"]',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      return { content, thumbnail };
      
    } catch (error) {
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