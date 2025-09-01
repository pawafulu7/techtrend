import { BaseContentEnricher } from './base';
import * as cheerio from 'cheerio';

/**
 * AWS Blog Content Enricher
 * AWSブログ記事の完全なコンテンツを取得
 */
export class AWSEnricher extends BaseContentEnricher {
  /**
   * AWSブログのURLかどうかを判定
   * セキュリティ強化: URLパースによる厳密なホスト検証
   */
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // 許可されたAWSドメインのリスト
      const allowedHosts = [
        'aws.amazon.com',
        'www.aws.amazon.com',
      ];
      return allowedHosts.includes(parsedUrl.hostname);
    } catch {
      // 不正なURLの場合はfalseを返す
      return false;
    }
  }

  /**
   * AWSブログの記事を詳細に取得してエンリッチ
   */
  async enrich(url: string): Promise<{ content: string | null; thumbnail?: string | null } | null> {
    try {
      // console.log(`[AWS Enricher] Fetching content from: ${url}`);
      
      // タイムアウト設定（15秒）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[AWS Enricher] Failed to fetch: ${response.status}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // コンテンツの抽出（AWSブログの構造に基づく）
      let content = '';
      let thumbnail: string | null = null;
      
      // メインコンテンツエリアを探す（複数のセレクタを試す）
      const contentSelectors = [
        // AWS Blog specific selectors
        '.blog-post-content',
        '.blog-content',
        'article .content',
        '.entry-content',
        'main article',
        '[itemprop="articleBody"]',
        '.post-content',
        '#aws-page-content',
        '.aws-text-box',
        // What's New specific selectors
        '.whatsnew-content',
        '.whats-new-content',
        // Generic fallbacks
        'article',
        'main',
        '.content',
      ];
      
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          // 不要な要素を削除
          element.find('script, style, noscript, iframe, nav, header, footer').remove();
          element.find('.social-share, .related-posts, .comments').remove();
          
          content = element.text().trim();
          
          // コンテンツが十分な長さがあるかチェック
          if (content.length > this.getMinContentLength()) {
            // console.log(`[AWS Enricher] Found content with selector: ${selector} (${content.length} chars)`);
            break;
          }
        }
      }
      
      // コンテンツが短すぎる場合は、段落を個別に収集
      if (content.length < this.getMinContentLength()) {
        const paragraphs: string[] = [];
        $('p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) { // 短い段落は除外
            paragraphs.push(text);
          }
        });
        
        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
          // console.log(`[AWS Enricher] Collected paragraphs: ${paragraphs.length} (${content.length} chars)`);
        }
      }
      
      // サムネイル画像の抽出
      const thumbnailSelectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        '.blog-post-image img',
        'article img',
        '.featured-image img',
      ];
      
      for (const selector of thumbnailSelectors) {
        if (selector.startsWith('meta')) {
          const metaContent = $(selector).attr('content');
          if (metaContent) {
            thumbnail = this.normalizeImageUrl(metaContent, url);
            break;
          }
        } else {
          const imgSrc = $(selector).first().attr('src');
          if (imgSrc) {
            thumbnail = this.normalizeImageUrl(imgSrc, url);
            break;
          }
        }
      }
      
      // コンテンツが取得できなかった場合
      const minLength = Math.min(200, this.getMinContentLength());
      if (!content || content.length < minLength) {
        console.error(`[AWS Enricher] Insufficient content found (${content.length} chars, minimum: ${minLength})`);
        return null;
      }
      
      // console.log(`[AWS Enricher] Successfully enriched: ${content.length} chars, thumbnail: ${thumbnail ? 'yes' : 'no'}`);
      
      return { 
        content: content || null, 
        thumbnail: thumbnail || null 
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error('[AWS Enricher] Request timeout after 15 seconds');
        } else {
          console.error('[AWS Enricher] Error during enrichment:', error.message);
        }
      } else {
        console.error('[AWS Enricher] Unknown error during enrichment');
      }
      return null;
    }
  }
  
  /**
   * 画像URLを正規化
   */
  private normalizeImageUrl(imageUrl: string, baseUrl: string): string {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    
    if (imageUrl.startsWith('//')) {
      return 'https:' + imageUrl;
    }
    
    if (imageUrl.startsWith('/')) {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${imageUrl}`;
    }
    
    // 相対パス
    const url = new URL(baseUrl);
    const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    return `${url.protocol}//${url.host}${basePath}/${imageUrl}`;
  }
  
  /**
   * レート制限の設定（1.5秒）
   */
  protected getRateLimit(): number {
    return 1500;
  }
  
  /**
   * コンテンツセレクタの取得
   */
  protected getContentSelectors(): string[] {
    return [
      '.blog-post-content',
      '.blog-content',
      'article .content',
      '.entry-content',
      '#aws-page-content',
      '.aws-text-box',
      'article',
      'main',
    ];
  }
  
  /**
   * 最小コンテンツ長の取得
   */
  protected getMinContentLength(): number {
    return 500; // AWS記事は比較的長いので500文字以上
  }
}