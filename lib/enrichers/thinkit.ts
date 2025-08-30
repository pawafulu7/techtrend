/**
 * Think IT Content Enricher
 * Think IT記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import * as cheerio from 'cheerio';

export class ThinkITContentEnricher extends BaseContentEnricher {
  /**
   * Think ITのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('thinkit.co.jp');
  }

  /**
   * Think ITの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Think ITの記事構造に合わせたセレクタ
      const selectors = [
        // Think IT特有のセレクタ（推定）
        '.article-body',
        '.article-content',
        '.content-body',
        '.entry-content',
        '.post-body',
        '.main-article',
        '#article-body',
        '#article-content',
        
        // 一般的な記事セレクタ
        'article .content',
        'article section',
        '.article',
        '.post-content',
        'main article',
        'main .content',
        '.container article',
        '.wrapper article',
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
   * フォールバック: より広範囲からコンテンツを抽出
   */
  private extractWithFallback(html: string): string {
    const $ = cheerio.load(html);
    
    // 不要な要素を削除
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('.sidebar').remove();
    $('.side').remove();
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.pankuzu').remove();  // パンくず（日本語）
    $('.share').remove();
    $('.sns').remove();
    $('.social').remove();
    $('.author').remove();
    $('.writer').remove();
    $('.comment').remove();
    $('.ad').remove();
    $('.advertisement').remove();
    $('.banner').remove();
    $('.pr').remove();
    $('.recommend').remove();
    $('.related').remove();
    $('.ranking').remove();
    $('.pickup').remove();
    
    // 優先順位: article > main > .content > .container > body
    let content = '';
    
    const articleContent = $('article');
    if (articleContent.length > 0) {
      content = articleContent.text();
    } else {
      const mainContent = $('main');
      if (mainContent.length > 0) {
        content = mainContent.text();
      } else {
        const contentDiv = $('.content, #content');
        if (contentDiv.length > 0) {
          content = contentDiv.first().text();
        } else {
          const containerContent = $('.container, .wrapper');
          if (containerContent.length > 0) {
            content = containerContent.first().text();
          } else {
            // 最終手段: bodyから取得
            content = $('body').text();
          }
        }
      }
    }
    
    // テキストのクリーンアップ
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}