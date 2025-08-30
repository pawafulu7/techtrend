/**
 * Content Enricher Base Classes
 * 企業技術ブログのフルコンテンツ取得用基底クラス
 */

import * as cheerio from 'cheerio';

/**
 * エンリッチされたコンテンツのデータ構造
 */
export interface EnrichedContent {
  content: string | null;
  thumbnail?: string | null;
}
export type EnrichmentResult = EnrichedContent;

/**
 * コンテンツエンリッチャーのインターフェース
 */
export interface IContentEnricher {
  /**
   * URLから記事の本文とサムネイルを取得
   * @param url 記事のURL
   * @returns エンリッチされたコンテンツ。取得失敗時はnull
   */
  enrich(url: string): Promise<EnrichedContent | null>;

  /**
   * このエンリッチャーが処理可能なURLかを判定
   * @param url チェック対象のURL
   */
  canHandle(url: string): boolean;
}

/**
 * エンリッチャーの基底クラス
 * 共通のレート制限やリトライ処理を提供
 */
export abstract class BaseContentEnricher implements IContentEnricher {
  protected rateLimit = 1500; // デフォルト1.5秒
  protected maxRetries = 3;
  protected retryDelay = 1000; // 1秒

  // 既定実装: セレクタベースで本文抽出
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);
      const $ = cheerio.load(html);

      // 不要要素を削除
      $('script, style, noscript, iframe').remove();

      const selectors = this.getContentSelectors();
      let text = '';
      for (const sel of selectors) {
        const el = $(sel);
        if (el.length > 0) {
          text = el.text().trim();
          if (this.isContentSufficient(text, this.getMinContentLength())) break;
        }
      }

      if (!this.isContentSufficient(text, this.getMinContentLength())) {
        // フォールバック: 段落を収集
        const paras: string[] = [];
        $('article p, main p, .post p, .entry-content p').each((_, e) => {
          const t = $(e).text().trim();
          if (t.length > 50) paras.push(t);
        });
        if (paras.length > 0) text = paras.join('\n\n');
      }

      if (!this.isContentSufficient(text, 100)) {
        return null;
      }

      const thumbnail = this.extractThumbnail(html);
      return { content: text || null, thumbnail: thumbnail ?? null };
    } catch {
      return null;
    }
  }

  abstract canHandle(url: string): boolean;

  // 既定の抽出セレクタと最小長
  protected getContentSelectors(): string[] {
    return ['article', '.entry-content', '.post-content', 'main'];
  }
  protected getMinContentLength(): number {
    return 200;
  }

  /**
   * リトライ機能付きのfetch
   */
  protected async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // リトライ時は指数バックオフ
          await this.delay(this.retryDelay * Math.pow(2, attempt - 1));
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'TechTrend/1.0 (https://techtrend.example.com) ContentEnricher',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja,en;q=0.9',
          },
        });

        if (response.status === 429) {
          // Rate limit エラー時は長めに待機
          await this.delay(30000);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        
        // レート制限のための待機
        await this.delay(this.rateLimit);
        
        return html;
      } catch (_error) {
        lastError = _error as Error;
      }
    }

    throw lastError || new Error('Failed to fetch content');
  }

  /**
   * HTMLコンテンツをテキストに変換してサニタイズ
   */
  protected sanitizeContent(html: string, selector: string | string[]): string {
    const $ = cheerio.load(html);
    
    // 不要な要素を削除
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('.advertisement').remove();
    $('.sidebar').remove();
    $('.related-posts').remove();
    $('.comments').remove();
    $('footer').remove();
    $('header').remove();
    
    // セレクタから本文を抽出
    const selectors = Array.isArray(selector) ? selector : [selector];
    let content = '';
    
    for (const sel of selectors) {
      const element = $(sel);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }
    
    if (!content) {
      // フォールバック: body全体から取得
      content = $('body').text();
    }
    
    // テキストのクリーンアップ
    return content
      .replace(/\s+/g, ' ') // 連続する空白を1つに
      .replace(/\n{3,}/g, '\n\n') // 3つ以上の改行を2つに
      .trim();
  }

  /**
   * 遅延処理
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * コンテンツの最小文字数チェック
   */
  protected isContentSufficient(content: string, minLength: number = 100): boolean {
    return !!content && content.length >= minLength;
  }

  /**
   * OGイメージやサムネイルURLを取得
   */
  protected extractThumbnail(html: string): string | null {
    const $ = cheerio.load(html);
    
    // OGイメージを優先
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      return ogImage;
    }
    
    // Twitter用画像
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) {
      return twitterImage;
    }
    
    // JSON-LDからサムネイルを取得
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript);
        if (data.thumbnailUrl) {
          return data.thumbnailUrl;
        }
        if (data.image) {
          if (typeof data.image === 'string') {
            return data.image;
          } else if (data.image.url) {
            return data.image.url;
          }
        }
      } catch (_error) {
        // JSON解析エラーは無視
      }
    }
    
    return null;
  }
}
