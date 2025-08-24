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
    // Google AI BlogのURLパターン（新旧両方に対応）
    return url.includes('blog.google') && 
           (url.includes('/technology/ai/') || 
            url.includes('/technology/google-deepmind/') ||
            url.includes('/technology/developers/') ||
            url.includes('/products/') ||  // 新しいパターン: /products/search/, /products/pixel/など
            url.includes('/intl/') ||  // 国際版のパターン
            url.includes('/inside-google/'));  // 企業アナウンスメント系
  }

  /**
   * Google AI Blogの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
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