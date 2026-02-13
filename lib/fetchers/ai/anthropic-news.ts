import { Source } from '@prisma/client';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseFetcher } from '../base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { logger } from '@/lib/cli/utils/logger';
import { anthropicNewsConfig } from '@/lib/config/anthropic-news';

interface AnthropicNewsArticleCandidate {
  url: string;
  title: string;
  publishedAt: Date;
  category?: string;
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

export class AnthropicNewsFetcher extends BaseFetcher {
  constructor(source: Source) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      logger.info('[Anthropic News] Fetching articles...');

      const html = await this.fetchWithRetry('https://www.anthropic.com/news');
      const candidates = this.parseArticles(html);

      if (candidates.length === 0) {
        logger.warn(
          '[Anthropic News] No articles found. Site structure may have changed.'
        );
      }

      // Filter articles within 30 days, then limit to maxArticles
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const filteredCandidates = candidates
        .filter(
          (candidate) =>
            candidate.publishedAt >= thirtyDaysAgo &&
            candidate.publishedAt <= now
        )
        .slice(0, anthropicNewsConfig.maxArticles);

      for (const candidate of filteredCandidates) {
        const article: CreateArticleInput = {
          title: this.sanitizeText(candidate.title),
          url: candidate.url,
          content: candidate.title,
          publishedAt: candidate.publishedAt,
          sourceId: this.source.id,
          tagNames: this.generateTags(candidate.category),
          thumbnail: candidate.thumbnail,
        };

        articles.push(article);
      }

      logger.info(`[Anthropic News] Fetched ${articles.length} articles`);
    } catch (error) {
      logger.error(
        `[Anthropic News] Fetch error: ${error instanceof Error ? error.message : String(error)}`
      );
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (articles.length > 0 && articles.length < 3) {
      logger.warn(
        `[Anthropic News] Unusually low article count: ${articles.length}`
      );
    }

    return { articles, errors };
  }

  private parseArticles(html: string): AnthropicNewsArticleCandidate[] {
    const $ = cheerio.load(html);
    const candidates: AnthropicNewsArticleCandidate[] = [];
    const seenUrls = new Set<string>();

    // Find all links pointing to /news/ paths or known special paths
    $('a[href]').each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      if (!href) return;

      // Only match /news/* article paths (not /news itself)
      if (!this.isArticlePath(href)) return;

      // Validate URL
      const validatedUrl = this.validateArticleUrl(href);
      if (!validatedUrl) return;

      // Deduplicate
      if (seenUrls.has(validatedUrl)) return;

      // Extract title from the link or nearby heading
      const title = this.extractTitle($, $link);
      if (!title) return;

      seenUrls.add(validatedUrl);

      // Extract date from nearby text
      const dateText = this.extractDateText($, $link);
      const publishedAt = this.parseArticleDate(dateText);

      // Extract category
      const category = this.extractCategory($, $link);

      candidates.push({
        url: validatedUrl,
        title,
        publishedAt,
        category,
      });
    });

    return candidates;
  }

  private isArticlePath(href: string): boolean {
    // Match /news/{slug} but not /news itself or /news/
    if (href === '/news' || href === '/news/') return false;
    if (href.startsWith('/news/') && href.length > 6) return true;
    // Special paths like /mars
    if (href === '/mars') return true;
    // Absolute URLs
    try {
      const url = new URL(
        href.startsWith('http') ? href : `https://www.anthropic.com${href}`
      );
      const isAllowedHost = anthropicNewsConfig.allowedArticleHosts.some(
        (host) => url.hostname === host
      );
      if (!isAllowedHost) return false;
      return (
        (url.pathname.startsWith('/news/') && url.pathname.length > 6) ||
        url.pathname === '/mars'
      );
    } catch (error) {
      if (anthropicNewsConfig.debug) {
        logger.debug(
          `[Anthropic News] URL parse error in isArticlePath for "${href}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return false;
    }
  }

  private extractTitle(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string {
    // Try headings inside the link
    const $heading = $link.find('h1, h2, h3, h4');
    if ($heading.length > 0) {
      const text = $heading.first().text().trim();
      if (text) return text;
    }

    // Try the link's own text (excluding date-like text)
    const linkText = $link.text().trim();
    if (linkText && linkText.length > 10 && !this.isDateLikeText(linkText)) {
      // Take the longest line as the title
      const lines = linkText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 5 && !this.isDateLikeText(l));
      if (lines.length > 0) {
        return lines.reduce((a, b) => (a.length > b.length ? a : b));
      }
    }

    // Try parent's heading
    const $parent = $link.parent();
    const $parentHeading = $parent.find('h1, h2, h3, h4');
    if ($parentHeading.length > 0) {
      return $parentHeading.first().text().trim();
    }

    return '';
  }

  private isDateLikeText(text: string): boolean {
    return /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i.test(
      text.trim()
    );
  }

  private extractDateText(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string {
    // Search within the link and nearby elements for date patterns
    const searchAreas = [$link, $link.parent(), $link.parent().parent()];

    const datePattern =
      /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/;

    for (const $area of searchAreas) {
      const text = $area.text();
      const match = text.match(datePattern);
      if (match) return match[0];
    }

    // Try ISO date format from data attributes or time elements
    const $time = $link.closest('[datetime]');
    if ($time.length > 0) {
      return $time.attr('datetime') || '';
    }

    return '';
  }

  private parseArticleDate(dateText: string): Date {
    if (!dateText) return new Date();

    // Try ISO format first
    const isoDate = new Date(dateText);
    if (!isNaN(isoDate.getTime())) return isoDate;

    // Try common English date formats
    const formats = [
      // "February 12, 2026" or "Feb 12, 2026"
      /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/,
    ];

    for (const pattern of formats) {
      const match = dateText.match(pattern);
      if (match) {
        const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }

    logger.warn(
      `[Anthropic News] Date parse failed for "${dateText.slice(0, 50)}". Using current date.`
    );
    return new Date();
  }

  private extractCategory(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string | undefined {
    const knownCategories = [
      'Announcements',
      'Policy',
      'Product',
      'Research',
      'Societal Impacts',
      'Company',
    ];

    const searchAreas = [$link, $link.parent(), $link.parent().parent()];

    for (const $area of searchAreas) {
      const text = $area.text();
      for (const category of knownCategories) {
        if (text.includes(category)) return category;
      }
    }

    return undefined;
  }

  /**
   * Validate article URL with security checks
   */
  validateArticleUrl(href: string): string | undefined {
    if (!href) return undefined;

    if (href.length > anthropicNewsConfig.maxUrlLength) return undefined;

    // Early rejection of dangerous protocols (case-insensitive)
    const lowerHref = href.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerHref.startsWith(protocol)) return undefined;
    }

    try {
      const url = href.startsWith('http')
        ? href
        : `https://www.anthropic.com${href.startsWith('/') ? '' : '/'}${href}`;

      const parsed = new URL(url);

      if (parsed.protocol !== 'https:') return undefined;

      if (parsed.username || parsed.password) return undefined;

      const isAllowedHost = anthropicNewsConfig.allowedArticleHosts.some(
        (host) => parsed.hostname === host
      );
      if (!isAllowedHost) return undefined;

      return parsed.href;
    } catch (error) {
      if (anthropicNewsConfig.debug) {
        logger.debug(
          `[Anthropic News] URL validation error for "${href}": ${error instanceof Error ? error.message : 'Unknown'}`
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

    if (src.length > anthropicNewsConfig.maxUrlLength) return undefined;

    const lowerSrc = src.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerSrc.startsWith(protocol)) return undefined;
    }

    try {
      const url = src.startsWith('//') ? `https:${src}` : src;
      const parsed = new URL(url);

      if (parsed.protocol !== 'https:') return undefined;
      if (parsed.username || parsed.password) return undefined;

      const isAllowedHost = anthropicNewsConfig.allowedThumbnailHosts.some(
        (host) =>
          parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
      if (!isAllowedHost) return undefined;

      return parsed.href;
    } catch (error) {
      if (anthropicNewsConfig.debug) {
        logger.debug(
          `[Anthropic News] Thumbnail URL validation error for "${src}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }

  private generateTags(category?: string): string[] {
    const tags = ['Anthropic', 'AI'];
    if (category) tags.push(category);
    return tags;
  }

  private async fetchWithRetry(url: string, retries = 0): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        anthropicNewsConfig.timeout
      );

      try {
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

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (retries < anthropicNewsConfig.retryLimit) {
        const waitTime = anthropicNewsConfig.requestDelay * (retries + 1);
        if (anthropicNewsConfig.debug) {
          logger.debug(
            `[Anthropic News] Retry ${retries + 1}/${anthropicNewsConfig.retryLimit} after error: ${error instanceof Error ? error.message : error}`
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
