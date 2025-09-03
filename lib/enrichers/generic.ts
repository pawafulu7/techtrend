import { BaseContentEnricher, EnrichmentResult } from './base';
import * as cheerio from 'cheerio';

/**
 * 汎用コンテンツエンリッチャー
 * すべてのURLに対応し、様々な方法でコンテンツ抽出を試みる
 */
export class GenericContentEnricher extends BaseContentEnricher {
  canHandle(_url: string): boolean {
    // すべてのURLを処理可能
    return true;
  }

  async enrich(url: string): Promise<EnrichmentResult | null> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // リトライ時は待機時間を設ける（exponential backoff）
        if (attempt > 1) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30000) // 30秒タイムアウト
        });

        if (!response.ok) {
          console.warn(`[GenericEnricher] HTTP ${response.status} for ${url} (attempt ${attempt}/${maxRetries})`);
          if (response.status === 429) {
            // Rate limit - より長く待機
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          }
          if (attempt === maxRetries) {
            return null;
          }
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // スクリプトやスタイルを削除
        $('script, style, noscript, iframe').remove();

        // Open Graphメタデータの取得
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDescription = $('meta[property="og:description"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');

        // Twitter Cardメタデータ
        const twitterDescription = $('meta[name="twitter:description"]').attr('content');
        const twitterImage = $('meta[name="twitter:image"]').attr('content');

        // 一般的なメタデータ
        const metaDescription = $('meta[name="description"]').attr('content');
        const title = $('title').text().trim();

        // サムネイル画像の優先順位
        const thumbnail = ogImage || twitterImage || this.findFirstImage($) || undefined;

        // コンテンツ抽出戦略
        let content = '';

        // 1. 構造化データを探す（JSON-LD）
        const jsonLdScripts = $('script[type="application/ld+json"]');
        jsonLdScripts.each((_, element) => {
          try {
            const jsonData = JSON.parse($(element).html() || '{}');
            if (jsonData.articleBody) {
              content = jsonData.articleBody;
            } else if (jsonData.description) {
              content = jsonData.description;
            }
          } catch {
            // JSON解析エラーは無視
          }
        });

        // 2. article要素やmain要素から抽出
        if (!content) {
          const contentSelectors = [
            'article',
            'main',
            '[role="main"]',
            '[role="article"]',
            '.article',
            '.post',
            '.entry-content',
            '.post-content',
            '.article-content',
            '.content-body',
            '.story-body',
            '#content',
            '.content',
            '.markdown-body', // GitHub
            '.blob-wrapper', // GitHub
            '.readme', // GitHub README
            '.documentation-content',
            '.doc-content'
          ];

          for (const selector of contentSelectors) {
            const element = $(selector).first();
            if (element.length && element.text().trim().length > 200) {
              // ナビゲーションやサイドバーを除外
              element.find('nav, aside, .sidebar, .navigation, .menu, .toc').remove();
              content = element.text().trim();
              break;
            }
          }
        }

        // 3. 段落タグから抽出
        if (!content || content.length < 200) {
          const paragraphs: string[] = [];
          $('p').each((_, element) => {
            const text = $(element).text().trim();
            if (text.length > 50) {
              paragraphs.push(text);
            }
          });
          if (paragraphs.length > 0) {
            content = paragraphs.join('\n\n');
          }
        }

        // 4. メタデータから構築
        if (!content || content.length < 100) {
          const parts: string[] = [];
          if (title && !ogTitle) parts.push(title);
          if (ogTitle) parts.push(ogTitle);
          if (ogDescription) parts.push(ogDescription);
          if (metaDescription && metaDescription !== ogDescription) {
            parts.push(metaDescription);
          }
          if (twitterDescription && 
              twitterDescription !== ogDescription && 
              twitterDescription !== metaDescription) {
            parts.push(twitterDescription);
          }

          // body全体から最初の500文字を抽出
          const bodyText = $('body').text().trim();
          if (bodyText.length > 100) {
            const cleanBody = bodyText
              .replace(/\s+/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .substring(0, 1000);
            parts.push(cleanBody);
          }

          content = parts.join('\n\n');
        }

        // コンテンツのクリーンアップ
        content = this.cleanupContent(content);

        // 最小長チェック
        if (content.length < 50) {
          console.warn(`[GenericEnricher] Content too short for ${url}: ${content.length} chars`);
          if (attempt === maxRetries) {
            return null;
          }
          continue;
        }

        // 成功
        return {
          content,
          thumbnail
        };

      } catch (error) {
        console.error(`[GenericEnricher] Error on attempt ${attempt}/${maxRetries} for ${url}:`, error);
        
        if (attempt === maxRetries) {
          console.error(`[GenericEnricher] All attempts failed for ${url}`);
          return null;
        }
      }
    }

    return null;
  }

  /**
   * 最初の画像を探す
   */
  private findFirstImage($: cheerio.CheerioAPI): string | undefined {
    const imageSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'article img',
      'main img',
      '.content img',
      'img[src*="thumbnail"]',
      'img[src*="featured"]',
      'img'
    ];

    for (const selector of imageSelectors) {
      const img = $(selector).first();
      if (img.length) {
        const src = img.attr('src') || img.attr('data-src');
        if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) {
          // 相対URLを絶対URLに変換する必要がある場合は、ここで処理
          return src;
        }
      }
    }

    return undefined;
  }

  /**
   * コンテンツのクリーンアップ
   */
  private cleanupContent(content: string): string {
    return content
      // 連続する空白を単一スペースに
      .replace(/[ \t]+/g, ' ')
      // 3つ以上の改行を2つに
      .replace(/\n{3,}/g, '\n\n')
      // 行頭行末の空白を削除
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // 全体のトリム
      .trim()
      // 最大長制限
      .substring(0, 100000);
  }
}