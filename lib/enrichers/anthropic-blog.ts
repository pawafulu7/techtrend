import { BaseContentEnricher } from './base';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import * as cheerio from 'cheerio';
import logger from '@/lib/logger';

export class ClaudeBlogEnricher extends BaseContentEnricher {
  /**
   * Claude Blog (claude.com/blog) の記事URLかどうかを判定
   */
  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'claude.com') && url.includes('/blog');
  }

  /**
   * Claude Blogの記事を詳細に取得してエンリッチ
   */
  async enrich(
    url: string
  ): Promise<{ content: string | null; thumbnail?: string | null } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        logger.error(
          { status: response.status, url },
          '[Claude Blog Enricher] Failed to fetch'
        );
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // 不要な要素を削除
      $('script, style, noscript, iframe, svg, nav, footer, header').remove();
      $('.nav_wrap, .footer_wrap, .blog_sidebar').remove();

      // コンテンツの抽出（Claude Blogの構造に基づく）
      let content = '';

      // メインコンテンツエリアを探す（複数のセレクタを試す）
      const contentSelectors = [
        '.u-rich-text-blog', // Claude Blog main content
        '.blog_rt_content',
        '[class*="rich-text-blog"]',
        'article .w-richtext',
        '.w-richtext',
        'main article',
      ];

      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          const texts: string[] = [];

          elements.each((_, elem) => {
            const $elem = $(elem);
            // 不要な要素を削除
            $elem
              .find(
                'script, style, noscript, iframe, .social-share, .related-posts'
              )
              .remove();

            const text = $elem.text().trim();
            if (text.length > 50) {
              texts.push(text);
            }
          });

          content = texts.join('\n\n');
          if (content.length > 500) {
            // 十分なコンテンツがあれば採用
            break;
          }
        }
      }

      // コンテンツが見つからない場合、段落を集める
      if (content.length < 500) {
        const paragraphs: string[] = [];
        $('main p, article p, .blog_content p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) {
            // 短すぎる段落は除外
            paragraphs.push(text);
          }
        });

        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
        }
      }

      // サムネイル画像の取得
      let thumbnail: string | undefined;

      // OGP画像を優先
      const ogImage =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content');

      if (ogImage) {
        thumbnail = this.normalizeImageUrl(ogImage, url);
      } else {
        // 記事内の最初の大きな画像を探す
        const firstImage = $(
          'article img, main img, .blog_content img'
        ).first();
        if (firstImage.length > 0) {
          const src = firstImage.attr('src') || firstImage.attr('data-src');
          if (src) {
            thumbnail = this.normalizeImageUrl(src, url);
          }
        }
      }

      // 結果の検証
      if (!content || content.length < 200) {
        logger.warn(
          { url, contentLength: content?.length ?? 0 },
          '[Claude Blog Enricher] Content too short'
        );
        return null;
      }

      logger.debug(
        { url, contentLength: content.length },
        '[Claude Blog Enricher] Successfully enriched'
      );

      return {
        content: content || null,
        thumbnail: thumbnail ?? null,
      };
    } catch (_error) {
      logger.error(
        { error: _error, url },
        '[Claude Blog Enricher] Error enriching URL'
      );
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
}
