import { BaseContentEnricher } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import * as cheerio from 'cheerio';
import logger from '@/lib/logger';

const ENRICHER_TIMEOUT = 15000; // 15 seconds

export class AnthropicNewsEnricher extends BaseContentEnricher {
  /**
   * Anthropic News (anthropic.com/news) の記事URLかどうかを判定
   */
  canHandle(url: string): boolean {
    if (!isUrlFromDomain(url, 'anthropic.com')) return false;
    try {
      const { pathname } = new URL(url);
      return (
        pathname === '/news' ||
        pathname.startsWith('/news/') ||
        pathname === '/mars'
      );
    } catch {
      return false;
    }
  }

  /**
   * Anthropic Newsの記事を詳細に取得してエンリッチ
   */
  async enrich(
    url: string
  ): Promise<{ content: string | null; thumbnail?: string | null } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENRICHER_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
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
          '[Anthropic News Enricher] Failed to fetch'
        );
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove non-content elements
      $('script, style, noscript, iframe, svg, nav, footer, header').remove();

      // Extract content from Anthropic News article structure
      let content = '';

      const contentSelectors = [
        'article',
        '[role="article"]',
        'main [class*="content"]',
        'main [class*="post"]',
        '.w-richtext',
        'main',
      ];

      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          const texts: string[] = [];

          elements.each((_, elem) => {
            const $elem = $(elem);
            $elem
              .find('script, style, noscript, iframe, .social-share')
              .remove();

            const text = $elem.text().trim();
            if (text.length > 50) {
              texts.push(text);
            }
          });

          content = texts.join('\n\n');
          if (content.length > 500) break;
        }
      }

      // Fallback: collect paragraphs
      if (content.length < 500) {
        const paragraphs: string[] = [];
        $('main p, article p').each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.length > 50) {
            paragraphs.push(text);
          }
        });

        if (paragraphs.length > 0) {
          content = paragraphs.join('\n\n');
        }
      }

      // Extract thumbnail
      let thumbnail: string | undefined;

      const ogImage =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content');

      if (ogImage) {
        thumbnail = this.normalizeImageUrl(ogImage, url);
      } else {
        const firstImage = $('article img, main img').first();
        if (firstImage.length > 0) {
          const src = firstImage.attr('src') || firstImage.attr('data-src');
          if (src) {
            thumbnail = this.normalizeImageUrl(src, url);
          }
        }
      }

      if (!content || content.length < 200) {
        logger.warn(
          { url, contentLength: content?.length ?? 0 },
          '[Anthropic News Enricher] Content too short'
        );
        return null;
      }

      logger.debug(
        { url, contentLength: content.length },
        '[Anthropic News Enricher] Successfully enriched'
      );

      return {
        content: content || null,
        thumbnail: thumbnail ?? null,
      };
    } catch (_error) {
      logger.error(
        { error: _error, url },
        '[Anthropic News Enricher] Error enriching URL'
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private normalizeImageUrl(
    imageUrl: string,
    baseUrl: string
  ): string | undefined {
    try {
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

      const url = new URL(baseUrl);
      const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
      return `${url.protocol}//${url.host}${basePath}/${imageUrl}`;
    } catch (error) {
      logger.warn(
        { imageUrl, baseUrl, error },
        '[Anthropic News Enricher] Failed to normalize image URL'
      );
      return undefined;
    }
  }
}
