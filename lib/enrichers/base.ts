/**
 * Content Enricher Base Classes
 * 企業技術ブログのフルコンテンツ取得用基底クラス
 */

import * as cheerio from 'cheerio';

/**
 * コンテンツエンリッチャーのインターフェース
 */
export interface IContentEnricher {
  /**
   * URLから記事の本文を取得
   * @param url 記事のURL
   * @returns 本文テキスト。取得失敗時はnull
   */
  enrich(url: string): Promise<string | null>;

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

  abstract enrich(url: string): Promise<string | null>;
  abstract canHandle(url: string): boolean;

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
          console.warn(`[Enricher] Rate limit hit for ${url}, waiting 30s...`);
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
      } catch (error) {
        lastError = error as Error;
        console.error(`[Enricher] Attempt ${attempt + 1} failed for ${url}:`, error);
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
    return content && content.length >= minLength;
  }
}