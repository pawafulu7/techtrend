/**
 * Hatena Bookmark Content Enricher
 * はてなブックマーク経由記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import * as cheerio from 'cheerio';

export class HatenaContentEnricher extends BaseContentEnricher {
  /**
   * はてなブックマーク記事のURLかチェック
   * 注意: これは実際のコンテンツURLをチェック（はてなのURL自体ではない）
   */
  canHandle(url: string): boolean {
    // はてなブックマーク経由の記事すべてに対応
    // 特定のドメインに限定しない（様々なサイトの記事が対象のため）
    return true;
  }

  /**
   * 記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
      // はてなブックマークのURLの場合はスキップ
      if (url.includes('b.hatena.ne.jp')) {
        return null;
      }
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // 汎用的なセレクタで本文を取得
      const selectors = [
        // 一般的な記事セレクタ
        'article .entry-content',
        'article .post-content',
        'article .article-body',
        'article .content',
        '.article-content',
        '.post-body',
        '.entry-body',
        '.content-body',
        '.main-content',
        '#main-content',
        'main article',
        'main .content',
        
        // 技術ブログ特有のセレクタ
        '.markdown-body',          // GitHub風
        '.prose',                  // Tailwind系
        '.article-text',
        '.blog-post-content',
        '.post-entry',
        
        // Qiita系
        '.it-MdContent',
        '.mdContent',
        
        // note系
        '.note-body',
        '.p-note__body',
        
        // Medium系
        '.postArticle-content',
        'article section',
        
        // WordPress系
        '.entry-content',
        '.post-content',
        '.the-content',
        '#content',
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
    $('.side-menu').remove();
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.share').remove();
    $('.social').remove();
    $('.related').remove();
    $('.recommend').remove();
    $('.author').remove();
    $('.comment').remove();
    $('.ad').remove();
    $('.advertisement').remove();
    $('.banner').remove();
    $('.widget').remove();
    $('.menu').remove();
    
    // 優先順位: article > main > .container > #wrapper > body
    let content = '';
    
    const articleContent = $('article');
    if (articleContent.length > 0) {
      content = articleContent.text();
    } else {
      const mainContent = $('main');
      if (mainContent.length > 0) {
        content = mainContent.text();
      } else {
        const containerContent = $('.container, .wrapper, #wrapper, #main');
        if (containerContent.length > 0) {
          content = containerContent.first().text();
        } else {
          // 最終手段: bodyから取得
          content = $('body').text();
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