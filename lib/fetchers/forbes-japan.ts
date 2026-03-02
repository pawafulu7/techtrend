import { Source } from '@prisma/client';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { logger } from '@/lib/cli/utils/logger';
import { forbesJapanConfig } from '@/lib/config/forbes-japan';

interface ForbesJapanArticleCandidate {
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

/** JST offset in milliseconds (UTC+9) */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export class ForbesJapanFetcher extends BaseFetcher {
  constructor(source: Source) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      logger.info('[Forbes Japan] Fetching articles...');

      const html = await this.fetchWithRetry(forbesJapanConfig.pageUrl);
      const candidates = this.parseArticles(html);

      if (candidates.length === 0) {
        logger.warn(
          '[Forbes Japan] No articles found. Site structure may have changed.'
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
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, forbesJapanConfig.maxArticles);

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

      logger.info(`[Forbes Japan] Fetched ${articles.length} articles`);
    } catch (error) {
      logger.error(`[Forbes Japan] Fetch error: ${error}`);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Warn if article count is unusually low
    if (articles.length > 0 && articles.length < 3) {
      logger.warn(
        `[Forbes Japan] Unusually low article count: ${articles.length}`
      );
    }

    return { articles, errors };
  }

  private parseArticles(html: string): ForbesJapanArticleCandidate[] {
    const $ = cheerio.load(html);
    const candidates: ForbesJapanArticleCandidate[] = [];
    const seenUrls = new Set<string>();

    // URLパターン起点: a[href^="/articles/detail/"] を探す
    const $links = $(forbesJapanConfig.articleLinkSelector);

    if (forbesJapanConfig.debug) {
      logger.debug(`[Forbes Japan] Found ${$links.length} article links`);
    }

    $links.each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');

      if (!href) return;

      // Validate URL
      const validatedUrl = this.validateArticleUrl(href);
      if (!validatedUrl) {
        if (forbesJapanConfig.debug) {
          logger.debug(`[Forbes Japan] Invalid URL: ${href}`);
        }
        return;
      }

      // Deduplicate by URL - check only, don't add yet
      if (seenUrls.has(validatedUrl)) return;

      // Extract title: link text or closest heading/title element
      const title = this.extractTitle($, $link);
      if (!title) return;

      // Extract date from surrounding context
      const dateText = this.extractDateText($, $link);
      const publishedAt = this.parseArticleDate(dateText);
      if (!publishedAt) return; // Skip articles with unparseable dates

      // Extract thumbnail from parent or sibling elements
      const thumbnail = this.extractThumbnailFromContext($, $link);

      // Mark as seen only after all validations pass
      seenUrls.add(validatedUrl);
      candidates.push({
        url: validatedUrl,
        title,
        publishedAt,
        thumbnail,
      });
    });

    return candidates;
  }

  /**
   * Extract article title from the link element or its context.
   * Walks up to parent card element to find title text.
   */
  private extractTitle(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string {
    // First try: Forbes Japan uses p.tit for the article title
    const $tit = $link.find('p.tit, .tit');
    if ($tit.length > 0) {
      const titText = $tit.text().trim();
      if (titText) return titText;
    }

    // Second try: look for a title/heading in the link or parent context
    const $heading = $link.find('h2, h3, h4, [class*="title"]').first();
    if ($heading.length > 0) {
      const headingText = $heading.text().trim();
      if (headingText) return headingText;
    }

    // Third try: img alt attribute (sometimes the link wraps an image)
    const $img = $link.find('img');
    if ($img.length > 0) {
      const alt = $img.attr('alt')?.trim();
      if (alt && alt.length > 5) return alt;
    }

    // Fallback: direct text content of the link
    const linkText = $link.text().trim();
    return linkText;
  }

  /**
   * Extract date text from the context around the article link.
   * Forbes Japan uses formats like "2026.3.2 10:30"
   */
  private extractDateText(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string {
    // Walk up to find a card-like container and search for date pattern
    const $container = $link.closest(
      'li, article, div[class*="card"], div[class*="article"], div[class*="item"]'
    );
    const searchTarget =
      $container.length > 0 ? $container : $link.parent().parent();

    // First try: specific date elements
    const dateSelectors = [
      'p.date',
      '.date',
      'time',
      'span.date',
      '[class*="date"]',
    ];
    for (const selector of dateSelectors) {
      const $dateEl = searchTarget.find(selector).first();
      if ($dateEl.length > 0) {
        const datePattern = /\d{4}\.\d{1,2}\.\d{1,2}\s+\d{1,2}:\d{2}/;
        const dateMatch = $dateEl.text().match(datePattern);
        if (dateMatch) return dateMatch[0];
      }
    }

    // Fallback: search full text
    const text = searchTarget.text();
    const datePattern = /\d{4}\.\d{1,2}\.\d{1,2}\s+\d{1,2}:\d{2}/;
    const match = text.match(datePattern);
    return match ? match[0] : '';
  }

  /**
   * Parse Forbes Japan date string to UTC Date.
   * Forbes Japan dates are in JST, so subtract 9 hours for UTC.
   * Returns undefined on parse failure (article will be skipped).
   */
  parseArticleDate(dateText: string): Date | undefined {
    if (!dateText) {
      return undefined;
    }

    try {
      // Parse "yyyy.M.d HH:mm" format manually to avoid TZ dependency
      const match = dateText.match(
        /^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/
      );
      if (!match) {
        logger.warn(
          `[Forbes Japan] Date parse failed for "${dateText.slice(0, 50)}": no match`
        );
        return undefined;
      }
      const [, year, month, day, hour, minute] = match;
      const m = parseInt(month);
      const d = parseInt(day);
      const h = parseInt(hour);
      const min = parseInt(minute);
      if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) {
        logger.warn(
          `[Forbes Japan] Date range invalid for "${dateText}": month=${m}, day=${d}, hour=${h}, minute=${min}`
        );
        return undefined;
      }
      // Construct as JST (UTC+9), then convert to UTC
      // Date.UTC gives us a UTC timestamp, so we create the date as if it were UTC
      // then subtract 9 hours to convert from JST to UTC
      const jstTimestamp = Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        0,
        0
      );
      const utcDate = new Date(jstTimestamp - JST_OFFSET_MS);

      if (isNaN(utcDate.getTime())) {
        logger.warn(
          `[Forbes Japan] Date parse returned invalid date for "${dateText}"`
        );
        return undefined;
      }
      return utcDate;
    } catch (error) {
      logger.warn(
        `[Forbes Japan] Date parse failed for "${dateText.slice(0, 50)}": ${error instanceof Error ? error.message : 'Unknown'}`
      );
      return undefined;
    }
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
    if (href.length > forbesJapanConfig.maxUrlLength) {
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
        : `https://forbesjapan.com${href.startsWith('/') ? '' : '/'}${href}`;

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
      const isAllowedHost = forbesJapanConfig.allowedArticleHosts.some(
        (host) => parsed.hostname === host
      );

      if (!isAllowedHost) {
        return undefined;
      }

      return parsed.href;
    } catch (error) {
      if (forbesJapanConfig.debug) {
        logger.debug(
          `[Forbes Japan] URL validation error for "${href}": ${error instanceof Error ? error.message : 'Unknown'}`
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
    if (src.length > forbesJapanConfig.maxUrlLength) {
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
      const url = src.startsWith('//')
        ? `https:${src}`
        : src.startsWith('/')
          ? `https://forbesjapan.com${src}`
          : src;
      const parsed = new URL(url);

      // Protocol validation
      if (parsed.protocol !== 'https:') {
        return undefined;
      }

      // Reject userinfo
      if (parsed.username || parsed.password) {
        return undefined;
      }

      // Host whitelist validation (exact match, consistent with article URL validation)
      const isAllowedHost = forbesJapanConfig.allowedThumbnailHosts.some(
        (host) => parsed.hostname === host
      );

      if (!isAllowedHost) {
        return undefined;
      }

      return parsed.href;
    } catch (error) {
      if (forbesJapanConfig.debug) {
        logger.debug(
          `[Forbes Japan] Thumbnail URL validation error for "${src}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }

  /**
   * Extract thumbnail from parent or sibling elements of the article link.
   */
  private extractThumbnailFromContext(
    $: cheerio.CheerioAPI,
    $link: cheerio.Cheerio<AnyNode>
  ): string | undefined {
    // Look for img in the link itself first
    let $img = $link.find('img').first();
    if ($img.length === 0) {
      // Look in parent container
      const $container = $link.closest(
        'li, article, div[class*="card"], div[class*="article"], div[class*="item"]'
      );
      if ($container.length > 0) {
        $img = $container.find('img').first();
      }
    }
    if ($img.length === 0) {
      // Look in sibling elements
      $img = $link.parent().find('img').first();
    }

    if ($img.length === 0) return undefined;

    const src =
      $img.attr('src') ||
      $img.attr('data-src') ||
      $img.attr('srcset')?.split(' ')[0];

    return this.validateThumbnailUrl(src);
  }

  private generateTags(): string[] {
    return ['Forbes Japan', 'AI'];
  }

  private async fetchWithRetry(url: string, retries = 0): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      forbesJapanConfig.timeout
    );
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (retries < forbesJapanConfig.retryLimit) {
        const waitTime = forbesJapanConfig.requestDelay * (retries + 1);
        if (forbesJapanConfig.debug) {
          logger.debug(
            `[Forbes Japan] Retry ${retries + 1}/${forbesJapanConfig.retryLimit}`
          );
        }
        await this.delay(waitTime);
        return this.fetchWithRetry(url, retries + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
