/**
 * Content Enricher Base Classes
 * 企業技術ブログのフルコンテンツ取得用基底クラス
 */

import * as cheerio from 'cheerio';
import logger from '@/lib/logger';

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
   * @param signal 外部abort signal (optional、呼び出し側でtimeout連携時に使用)
   * @returns エンリッチされたコンテンツ。取得失敗時はnull
   */
  enrich(url: string, signal?: AbortSignal): Promise<EnrichedContent | null>;

  /**
   * このエンリッチャーが処理可能なURLかを判定
   * @param url チェック対象のURL
   * @param sourceId 記事のsourceId (optional)。collect-feeds経由でsourceIdベースdispatchするenricherが利用する
   */
  canHandle(url: string, sourceId?: string): boolean;
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
  async enrich(
    url: string,
    signal?: AbortSignal
  ): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url, signal);
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

      const thumbnail = this.extractThumbnail(html);

      if (!this.isContentSufficient(text, 100)) {
        // コンテンツ不足でもサムネイルがあれば返す
        if (thumbnail) {
          return { content: null, thumbnail };
        }
        return null;
      }

      return { content: text || null, thumbnail: thumbnail ?? null };
    } catch (error) {
      this.logEnrichmentError(url, error);
      return null;
    }
  }

  abstract canHandle(url: string, sourceId?: string): boolean;

  // 既定の抽出セレクタと最小長
  protected getContentSelectors(): string[] {
    return ['article', '.entry-content', '.post-content', 'main'];
  }
  protected getMinContentLength(): number {
    return 200;
  }

  /**
   * リトライ機能付きのfetch
   * @param url 取得するURL
   * @param externalSignal 外部abort signal (呼び出し側のtimeout等と連動)
   */
  protected async fetchWithRetry(
    url: string,
    externalSignal?: AbortSignal
  ): Promise<string> {
    let lastError: Error | null = null;
    let previousWas429 = false;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // 直前が 429 の場合は loop 冒頭の exponential backoff を skip
        // (429 path の sleep のみ適用し、実質 1.5 秒リトライを守るため)
        if (attempt > 0 && !previousWas429) {
          await this.delay(
            Math.min(this.retryDelay * Math.pow(2, attempt - 1), 2000),
            externalSignal
          );
        }
        previousWas429 = false;

        // AbortSignal.timeout() は catch 経路で旧実装にあった
        // setTimeout+clearTimeout の leak を回避する（ただし成功/外部 abort 時の
        // timeout signal 自体は明示 dispose できない点に留意）
        const signal = this.composeSignal(externalSignal, 15000);
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'TechTrend/1.0 (https://techtrend.example.com) ContentEnricher',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja,en;q=0.9',
          },
          signal,
        });

        if (response.status === 429) {
          // Rate limit: 短縮 (1.5秒)。呼び出し側の source 別 sleep で本質的な rate 制御を行う
          // 接続プールの socket 保持を避けるため body を drain してから retry
          try {
            await response.body?.cancel();
          } catch {
            // body drain 失敗は retry 判定に影響させない
          }
          await this.delay(1500, externalSignal);
          previousWas429 = true;
          continue;
        }

        if (!response.ok) {
          try {
            await response.body?.cancel();
          } catch {
            // body drain 失敗は元の HTTP error を優先
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // レート制限のための待機
        await this.delay(this.rateLimit, externalSignal);

        return html;
      } catch (_error) {
        lastError = _error as Error;
        // 外部signalがabortされている場合は即時終了
        if (externalSignal?.aborted) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Failed to fetch content');
  }

  /**
   * 外部signalとper-fetch timeoutを合成
   */
  protected composeSignal(
    externalSignal: AbortSignal | undefined,
    timeoutMs: number
  ): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!externalSignal) return timeoutSignal;
    return AbortSignal.any([externalSignal, timeoutSignal]);
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
   * 遅延処理（abort signal 対応）
   */
  protected delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('Aborted'));
        return;
      }
      const timer = setTimeout(() => {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * コンテンツの最小文字数チェック
   */
  protected isContentSufficient(
    content: string,
    minLength: number = 100
  ): boolean {
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

    // JSON-LDからサムネイルを取得（複数scriptタグ・@graph対応）
    const jsonLdScripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
      const scriptHtml = $(jsonLdScripts[i]).html();
      if (!scriptHtml) continue;
      try {
        const data = JSON.parse(scriptHtml);
        const image = this.extractImageFromJsonLd(data);
        if (image) return image;
      } catch (_error) {
        // JSON解析エラーは無視
      }
    }

    return null;
  }

  /**
   * JSON-LDデータから画像URLを抽出
   * @graph配列、ネストされたimage、配列形式に対応
   */
  private extractImageFromJsonLd(
    data: unknown,
    depth: number = 0
  ): string | null {
    if (!data || typeof data !== 'object' || depth > 5) return null;

    // ルートが配列の場合（JSON-LDの一般的な形式）
    if (Array.isArray(data)) {
      for (const item of data) {
        const image = this.extractImageFromJsonLd(item, depth + 1);
        if (image) return image;
      }
      return null;
    }

    const obj = data as Record<string, unknown>;

    // @graph配列を再帰的に処理
    if (Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        const image = this.extractImageFromJsonLd(item, depth + 1);
        if (image) return image;
      }
    }

    // thumbnailUrl を優先
    if (typeof obj.thumbnailUrl === 'string' && obj.thumbnailUrl) {
      return obj.thumbnailUrl;
    }

    // image フィールド
    if (typeof obj.image === 'string' && obj.image) {
      return obj.image;
    }
    if (typeof obj.image === 'object' && obj.image !== null) {
      const img = obj.image as Record<string, unknown>;
      if (typeof img.url === 'string' && img.url) {
        return img.url;
      }
    }
    if (Array.isArray(obj.image) && obj.image.length > 0) {
      const first = obj.image[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first !== null) {
        const img = first as Record<string, unknown>;
        if (typeof img.url === 'string' && img.url) return img.url;
      }
    }

    return null;
  }

  /**
   * Enrichment失敗時のエラーログ
   */
  protected logEnrichmentError(url: string, error: unknown): void {
    logger.error(
      {
        url,
        enricher: this.constructor.name,
        err: error instanceof Error ? error : new Error(String(error)),
        status: 'failed',
      },
      '[Enrichment] failed'
    );
  }
}
