/**
 * Hugging Face Blog Content Enricher
 * Hugging Face Blog記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class HuggingFaceEnricher extends BaseContentEnricher {
  /**
   * Hugging Face BlogのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('huggingface.co/blog') || 
           url.includes('hf.co/blog');
  }

  /**
   * Hugging Face Blogの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Hugging Face Blogの記事構造に合わせたセレクタ
      const selectors = [
        // Hugging Face特有のセレクタ
        '.prose',
        'article .prose',
        '.blog-post-content',
        '.markdown-body',
        '.container .prose',
        'main .prose',
        
        // より一般的なセレクタ
        'article',
        'main article',
        '.content',
        '.post-content',
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
      'main',
      '.container',
      'body article',
      '#content',
    ];
    
    return this.sanitizeContent(html, selectors);
  }
}