/**
 * GMO Developers Content Enricher
 * GMO開発者ブログ（https://developers.gmo.jp/）のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class GMOContentEnricher extends BaseContentEnricher {
  /**
   * GMOのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('developers.gmo.jp');
  }

  /**
   * GMOの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.log(`[GMOEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // GMOはWordPressベースなので、一般的なWordPressセレクタを使用
      const selectors = [
        '.entry-content',           // 標準的なWordPressセレクタ
        '.post-content',            // 代替セレクタ
        'article .content',         // articleタグ内のcontent
        'main .content',            // mainタグ内のcontent
        '.single-content',          // シングルページ用
        '.article-body',            // 記事本文用
        '#content',                 // ID指定のコンテンツ
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[GMOEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.log(`[GMOEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[GMOEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[GMOEnricher] Failed to enrich ${url}:`, error);
      return null;
    }
  }

  /**
   * フォールバック: より広範囲からコンテンツを抽出
   */
  private extractWithFallback(html: string): string {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    // 不要な要素を削除
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('.sidebar').remove();
    $('.menu').remove();
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.share-buttons').remove();
    $('.related-posts').remove();
    $('.author-info').remove();
    $('.comments').remove();
    $('.advertisement').remove();
    
    // mainタグまたはarticleタグから取得を試みる
    let content = '';
    
    const mainContent = $('main');
    if (mainContent.length > 0) {
      content = mainContent.text();
    } else {
      const articleContent = $('article');
      if (articleContent.length > 0) {
        content = articleContent.text();
      } else {
        // 最終手段: bodyから取得
        content = $('body').text();
      }
    }
    
    // テキストのクリーンアップ
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}