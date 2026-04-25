import { BaseContentEnricher } from './base';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import { anthropicNewsConfig } from '@/lib/config/anthropic-news';
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
        pathname.startsWith('/news/') ||
        anthropicNewsConfig.specialArticlePaths.some((p) => pathname === p)
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
        // 接続プールの socket 保持を避けるため body を drain
        try {
          await response.body?.cancel();
        } catch {
          /* ignore: drain 失敗は失敗判定に影響させない */
        }
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

          const joined = texts.join('\n\n');
          if (joined.length > content.length) {
            content = joined;
          }
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
          const fallbackContent = paragraphs.join('\n\n');
          if (fallbackContent.length > content.length) {
            content = fallbackContent;
          }
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
    } catch (error) {
      logger.error(
        { err: error, url },
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
      let resolved: string;

      if (imageUrl.startsWith('//')) {
        resolved = 'https:' + imageUrl;
      } else if (
        imageUrl.startsWith('http://') ||
        imageUrl.startsWith('https://')
      ) {
        resolved = imageUrl;
      } else if (imageUrl.startsWith('/')) {
        const url = new URL(baseUrl);
        resolved = `${url.protocol}//${url.host}${imageUrl}`;
      } else {
        const url = new URL(baseUrl);
        const basePath = url.pathname.substring(
          0,
          url.pathname.lastIndexOf('/')
        );
        resolved = `${url.protocol}//${url.host}${basePath}/${imageUrl}`;
      }

      const parsed = new URL(resolved);
      if (parsed.protocol !== 'https:') {
        logger.warn(
          { imageUrl, baseUrl },
          '[Anthropic News Enricher] Rejected non-HTTPS image URL'
        );
        return undefined;
      }

      const isAllowedHost = anthropicNewsConfig.allowedThumbnailHosts.some(
        (host) => parsed.hostname === host
      );
      if (!isAllowedHost) {
        logger.warn(
          { imageUrl, hostname: parsed.hostname },
          '[Anthropic News Enricher] Rejected image URL from non-allowed host'
        );
        return undefined;
      }

      return resolved;
    } catch (error) {
      logger.warn(
        { imageUrl, baseUrl, err: error },
        '[Anthropic News Enricher] Failed to normalize image URL'
      );
      return undefined;
    }
  }
}
