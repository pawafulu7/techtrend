/**
 * Zenn Content Enricher
 * Zenn記事のフルコンテンツ取得
 */

import { BaseContentEnricher, EnrichedContent } from './base';

export class ZennContentEnricher extends BaseContentEnricher {
  /**
   * ZennのURLパターンにマッチするかチェック
   */
  canHandle(url: string): boolean {
    return url.includes('zenn.dev');
  }

  /**
   * Zennの記事ページから本文とサムネイルを取得
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      console.log(`[ZennEnricher] Fetching content from: ${url}`);
      
      const html = await this.fetchWithRetry(url);
      
      // サムネイルを取得
      const thumbnail = this.extractThumbnail(html);
      
      // Zennの記事構造に合わせたセレクタ
      const selectors = [
        // Zenn特有のセレクタ
        '.znc',                     // Zennのコンテンツクラス
        'article .znc',
        '.article-body',
        '.markdown-body',
        '.article__content',
        'article section',
        
        // 一般的な記事セレクタ
        'article .content',
        '.article-content',
        '.post-content',
        'main article',
        'main .content',
        '#article-content',
      ];
      
      const content = this.sanitizeContent(html, selectors);
      
      // コンテンツが取得できたか確認
      if (!this.isContentSufficient(content, 500)) {
        console.warn(`[ZennEnricher] Content too short (${content.length} chars) for ${url}`);
        
        // Zennの場合、APIから取得を試みる
        const apiContent = await this.fetchFromAPI(url);
        if (apiContent && this.isContentSufficient(apiContent, 500)) {
          console.log(`[ZennEnricher] Using API content (${apiContent.length} chars)`);
          return { content: apiContent, thumbnail };
        }
        
        // より広範囲を取得する試み
        const fallbackContent = this.extractWithFallback(html);
        if (this.isContentSufficient(fallbackContent, 500)) {
          console.log(`[ZennEnricher] Using fallback content (${fallbackContent.length} chars)`);
          return { content: fallbackContent, thumbnail };
        }
        
        // コンテンツが不十分でもサムネイルがあれば返す
        if (thumbnail) {
          console.log(`[ZennEnricher] Content insufficient but thumbnail found`);
          return { content: content || null, thumbnail };
        }
        
        return null;
      }
      
      console.log(`[ZennEnricher] Successfully enriched: ${content.length} characters`);
      return { content, thumbnail };
      
    } catch (error) {
      console.error(`[ZennEnricher] Failed to enrich ${url}:`, error);
      return null;
    }
  }

  /**
   * Zenn APIから記事内容を取得（将来的な実装用）
   */
  private async fetchFromAPI(url: string): Promise<string | null> {
    try {
      // URLから記事のスラッグを抽出
      const match = url.match(/articles\/([a-z0-9]+)/);
      if (!match) {
        return null;
      }
      
      const slug = match[1];
      
      // 注意: Zenn公式APIは現在公開されていないため、
      // 将来的にAPIが公開された場合の実装プレースホルダー
      console.log(`[ZennEnricher] API fetch not yet implemented for slug: ${slug}`);
      return null;
      
      // 将来的な実装例:
      // const apiUrl = `https://api.zenn.dev/articles/${slug}`;
      // const response = await fetch(apiUrl);
      // const data = await response.json();
      // return data.body || data.content;
      
    } catch (error) {
      console.error(`[ZennEnricher] API fetch failed:`, error);
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
    $('.toc').remove();  // 目次
    $('.navigation').remove();
    $('.breadcrumb').remove();
    $('.share').remove();
    $('.social').remove();
    $('.author-bio').remove();
    $('.comment').remove();
    $('.ad').remove();
    $('.advertisement').remove();
    $('.banner').remove();
    $('.recommend').remove();
    $('.related').remove();
    
    // 優先順位: article > main > .container > body
    let content = '';
    
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