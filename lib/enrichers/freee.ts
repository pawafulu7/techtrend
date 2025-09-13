/**
 * freee Developers Hub Content Enricher
 * freee開発者ブログ（https://developers.freee.co.jp/）のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import * as cheerio from 'cheerio';

export class FreeeContentEnricher extends BaseContentEnricher {
  /**
   * freeeのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'developers.freee.co.jp');
  }

  /**
   * freeeの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // freeeのブログ構造に合わせたセレクタ
      const selectors = [
        '.entry-body',              // freeeの実際のセレクタ（最優先）
        '.article-content',         // 記事コンテンツ
        '.post-content',            // 投稿コンテンツ
        'article .content',         // articleタグ内
        'main article',             // main内のarticle
        '.entry-content',           // エントリーコンテンツ
        '.blog-content',            // ブログコンテンツ
        '.main-content',            // メインコンテンツ
        '#article-body',            // ID指定
        '.article-body',            // クラス指定
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          return { content: fallbackContent, thumbnail };
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
    $('.side-menu').remove();
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.share').remove();
    $('.social-share').remove();
    $('.related').remove();
    $('.author').remove();
    $('.comment').remove();
    $('.ad').remove();
    $('.advertisement').remove();
    $('.banner').remove();
    
    // mainタグまたはarticleタグから取得を試みる
    let content = '';
    
    // 優先順位: article > main > .container > body
    const articleContent = $('article');
    if (articleContent.length > 0) {
      content = articleContent.text();
    } else {
      const mainContent = $('main');
      if (mainContent.length > 0) {
        content = mainContent.text();
      } else {
        const containerContent = $('.container');
        if (containerContent.length > 0) {
          content = containerContent.text();
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