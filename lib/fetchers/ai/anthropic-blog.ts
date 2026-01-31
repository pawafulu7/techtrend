import { Source } from '@prisma/client';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { parse as parseDate } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { logger } from '@/lib/cli/utils/logger';
import { claudeBlogConfig } from '@/lib/config/anthropic-blog';

interface ClaudeBlogArticleCandidate {
  url: string;
  title: string;
  publishedAt: Date;
  thumbnail?: string;
}

// Dangerous protocols that should be rejected
const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
] as const;

export class ClaudeBlogFetcher extends BaseFetcher {
  constructor(source: Source) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      logger.info('[Claude Blog] Fetching articles...');

      const html = await this.fetchWithRetry('https://claude.com/blog');
      const candidates = this.parseArticles(html);

      if (candidates.length === 0) {
        logger.warn(
          '[Claude Blog] No articles found with selectors. Site structure may have changed.'
        );
      }

      // Filter articles within 30 days first, then limit to maxArticles
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const filteredCandidates = candidates
        .filter(
          (candidate) =>
            candidate.publishedAt >= thirtyDaysAgo &&
            candidate.publishedAt <= now
        )
        .slice(0, claudeBlogConfig.maxArticles);

      for (const candidate of filteredCandidates) {
        const article: CreateArticleInput = {
          title: this.sanitizeText(candidate.title),
          url: candidate.url,
          content: candidate.title, // Use title as content for scraper
          publishedAt: candidate.publishedAt,
          sourceId: this.source.id,
          tagNames: this.generateTags(),
          thumbnail: candidate.thumbnail,
        };

        articles.push(article);
      }

      logger.info(`[Claude Blog] Fetched ${articles.length} articles`);
    } catch (error) {
      logger.error(`[Claude Blog] Fetch error: ${error}`);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Warn if article count is unusually low
    if (articles.length > 0 && articles.length < 3) {
      logger.warn(
        `[Claude Blog] Unusually low article count: ${articles.length}`
      );
    }

    return { articles, errors };
  }

  private parseArticles(html: string): ClaudeBlogArticleCandidate[] {
    const $ = cheerio.load(html);
    const candidates: ClaudeBlogArticleCandidate[] = [];

    // Try multiple selectors with fallback
    let $items = $();
    for (const selector of claudeBlogConfig.articleSelectors) {
      $items = $(selector);
      if ($items.length > 0) {
        if (claudeBlogConfig.debug) {
          logger.debug(
            `[Claude Blog] Selector "${selector}" found ${$items.length} items`
          );
        }
        break;
      }
    }

    $items.each((_, element) => {
      const $item = $(element);

      // Get link and title
      const $link = $item.find('a').first();
      const href = $link.attr('href');
      const $title = $item.find(claudeBlogConfig.titleSelector);
      const title = $title.text().trim() || $link.text().trim();

      if (!href || !title) return;

      // Validate URL
      const validatedUrl = this.validateArticleUrl(href);
      if (!validatedUrl) {
        if (claudeBlogConfig.debug) {
          logger.debug(`[Claude Blog] Invalid URL: ${href}`);
        }
        return;
      }

      // Parse date
      const dateText = this.extractDateText($item);
      const publishedAt = this.parseArticleDate(dateText);

      // Get thumbnail
      const thumbnail = this.extractThumbnailFromItem($item);

      candidates.push({
        url: validatedUrl,
        title,
        publishedAt,
        thumbnail,
      });
    });

    return candidates;
  }

  private extractDateText($item: cheerio.Cheerio<AnyNode>): string {
    // Search for text containing date
    const text = $item.text();
    const datePattern =
      /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/;
    const match = text.match(datePattern);
    return match ? match[0] : '';
  }

  private parseArticleDate(dateText: string): Date {
    if (!dateText) {
      return new Date();
    }

    // Try multiple date formats
    let lastError: Error | null = null;
    for (const format of claudeBlogConfig.dateFormats) {
      try {
        const parsed = parseDate(dateText, format, new Date(), {
          locale: enUS,
        });
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Continue to next format
      }
    }

    // All formats failed - log warning
    logger.warn(
      `[Claude Blog] Date parse failed for "${dateText.slice(0, 50)}": ${lastError?.message || 'No valid format'}. Using current date.`
    );
    return new Date();
  }

  /**
   * Validate article URL with security checks
   * - Protocol validation (HTTPS only)
   * - Host whitelist validation
   * - URL length limit
   * - Dangerous protocol rejection
   * - Userinfo rejection
   */
  validateArticleUrl(href: string): string | undefined {
    if (!href) return undefined;

    // URL length check
    if (href.length > claudeBlogConfig.maxUrlLength) {
      return undefined;
    }

    // Early rejection of dangerous protocols (case-insensitive)
    const lowerHref = href.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerHref.startsWith(protocol)) {
        return undefined;
      }
    }

    try {
      // Convert relative URL to absolute
      const url = href.startsWith('http')
        ? href
        : `https://claude.com${href.startsWith('/') ? '' : '/'}${href}`;

      const parsed = new URL(url);

      // Protocol validation
      if (parsed.protocol !== 'https:') {
        return undefined;
      }

      // Reject userinfo (username/password in URL)
      if (parsed.username || parsed.password) {
        return undefined;
      }

      // Host whitelist validation
      const isAllowedHost = claudeBlogConfig.allowedArticleHosts.some(
        (host) => parsed.hostname === host
      );

      if (!isAllowedHost) {
        return undefined;
      }

      return parsed.href;
    } catch (error) {
      if (claudeBlogConfig.debug) {
        logger.debug(
          `[Claude Blog] URL validation error for "${href}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }

  /**
   * Validate thumbnail URL with security checks
   */
  validateThumbnailUrl(src: string | undefined): string | undefined {
    if (!src) return undefined;

    // URL length check
    if (src.length > claudeBlogConfig.maxUrlLength) {
      return undefined;
    }

    // Early rejection of dangerous protocols
    const lowerSrc = src.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerSrc.startsWith(protocol)) {
        return undefined;
      }
    }

    try {
      const url = src.startsWith('//') ? `https:${src}` : src;
      const parsed = new URL(url);

      // Protocol validation
      if (parsed.protocol !== 'https:') {
        return undefined;
      }

      // Reject userinfo
      if (parsed.username || parsed.password) {
        return undefined;
      }

      // Host whitelist validation
      const isAllowedHost = claudeBlogConfig.allowedThumbnailHosts.some(
        (host) =>
          parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );

      if (!isAllowedHost) {
        return undefined;
      }

      return parsed.href;
    } catch (error) {
      if (claudeBlogConfig.debug) {
        logger.debug(
          `[Claude Blog] Thumbnail URL validation error for "${src}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }

  private extractThumbnailFromItem(
    $item: cheerio.Cheerio<AnyNode>
  ): string | undefined {
    const $img = $item.find('.card_blog_visual_wrap img, img').first();
    const src =
      $img.attr('src') ||
      $img.attr('data-src') ||
      $img.attr('srcset')?.split(' ')[0];
    return this.validateThumbnailUrl(src);
  }

  private generateTags(): string[] {
    return ['Claude', 'Anthropic', 'AI', 'LLM'];
  }

  private async fetchWithRetry(url: string, retries = 0): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        claudeBlogConfig.timeout
      );

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (retries < claudeBlogConfig.retryLimit) {
        const waitTime = claudeBlogConfig.requestDelay * (retries + 1);
        if (claudeBlogConfig.debug) {
          logger.debug(
            `[Claude Blog] Retry ${retries + 1}/${claudeBlogConfig.retryLimit}`
          );
        }
        await this.delay(waitTime);
        return this.fetchWithRetry(url, retries + 1);
      }
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
