import { Source } from '@/lib/prisma-exports';
import { BaseFetcher } from './base';
import { FetchResult } from '@/types/fetchers';
import { CreateArticleInput } from '@/types';
import { logger } from '@/lib/cli/utils/logger';
import { ledgeAiConfig } from '@/lib/config/ledge-ai';

interface StrapiArticle {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  scheduled_at: string | null;
  meta_description: string | null;
  is_promotional: boolean;
  publishedAt: string;
  thumbnail: {
    url: string;
    formats: {
      large?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      small?: { url: string; width: number; height: number };
      thumbnail?: { url: string; width: number; height: number };
    };
  } | null;
  main_category: { name: string; slug: string } | null;
  tags: { name: string }[];
  contents: { content: string }[];
}

interface StrapiResponse {
  data: StrapiArticle[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
] as const;

export class LedgeAiFetcher extends BaseFetcher {
  constructor(source: Source) {
    super(source);
  }

  async fetch(): Promise<FetchResult> {
    const articles: CreateArticleInput[] = [];
    const errors: Error[] = [];

    try {
      logger.info('[Ledge.ai] Fetching articles...');

      const response = await this.fetchArticlesFromApi();
      const seenUrls = new Set<string>();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();

      const items = response.data.slice(0, ledgeAiConfig.paginationLimit);

      for (const item of items) {
        try {
          // Promotional fallback filter (API param should exclude, but double-check)
          if (item.is_promotional) continue;

          const articleUrl = this.buildArticleUrl(item.slug);
          const validatedUrl = this.validateArticleUrl(articleUrl);
          if (!validatedUrl) {
            if (ledgeAiConfig.debug) {
              logger.debug(`[Ledge.ai] Invalid article URL: ${articleUrl}`);
            }
            continue;
          }

          if (seenUrls.has(validatedUrl)) continue;

          const publishedAt = this.parsePublishedAt(
            item.publishedAt,
            item.scheduled_at
          );
          if (!publishedAt) continue;

          if (publishedAt < thirtyDaysAgo || publishedAt > now) continue;

          const content = this.extractContent(item.contents ?? []);
          const thumbnail = this.extractThumbnailUrl(item.thumbnail);

          seenUrls.add(validatedUrl);
          articles.push({
            title: this.sanitizeText(item.title),
            url: validatedUrl,
            content,
            publishedAt,
            sourceId: this.source.id,
            tagNames: (item.tags ?? []).map((tag) => tag.name),
            thumbnail,
          });
        } catch (itemError) {
          logger.warn(
            `[Ledge.ai] Skipping article (id=${item.id}): ${itemError instanceof Error ? itemError.message : String(itemError)}`
          );
        }
      }

      logger.info(`[Ledge.ai] Fetched ${articles.length} articles`);
    } catch (error) {
      logger.error(`[Ledge.ai] Fetch error: ${error}`);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (articles.length > 0 && articles.length < 3) {
      logger.warn(`[Ledge.ai] Unusually low article count: ${articles.length}`);
    }

    return { articles, errors };
  }

  private async fetchArticlesFromApi(): Promise<StrapiResponse> {
    const url = new URL(ledgeAiConfig.apiBaseUrl);
    url.searchParams.set('sort', 'publishedAt:desc');
    url.searchParams.set(
      'pagination[limit]',
      String(ledgeAiConfig.paginationLimit)
    );
    url.searchParams.set('populate', '*');
    url.searchParams.set('filters[is_promotional][$eq]', 'false');

    const response = await this.retry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        ledgeAiConfig.timeout
      );

      try {
        const res = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        return (await res.json()) as StrapiResponse;
      } finally {
        clearTimeout(timeoutId);
      }
    }, ledgeAiConfig.retryLimit);

    return response;
  }

  private buildArticleUrl(slug: string): string {
    return `${ledgeAiConfig.articleBaseUrl}/${slug}`;
  }

  private parsePublishedAt(
    publishedAt: string | null,
    scheduledAt: string | null
  ): Date | undefined {
    const dateStr = publishedAt || scheduledAt;
    if (!dateStr) return undefined;

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        logger.warn(`[Ledge.ai] Invalid date: ${dateStr}`);
        return undefined;
      }
      return date;
    } catch {
      logger.warn(`[Ledge.ai] Date parse failed: ${dateStr}`);
      return undefined;
    }
  }

  private extractContent(contents: { content: string }[]): string {
    for (const block of contents) {
      const text = block.content?.trim();
      if (text) return text;
    }
    return '';
  }

  private extractThumbnailUrl(
    thumbnail: StrapiArticle['thumbnail']
  ): string | undefined {
    if (!thumbnail) return undefined;

    const url = thumbnail.formats?.small?.url || thumbnail.url;
    return this.validateThumbnailUrl(url);
  }

  validateArticleUrl(href: string): string | undefined {
    if (!href) return undefined;

    if (href.length > ledgeAiConfig.maxUrlLength) return undefined;

    const lowerHref = href.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerHref.startsWith(protocol)) return undefined;
    }

    try {
      const parsed = new URL(href, ledgeAiConfig.articleBaseUrl);

      if (parsed.protocol !== 'https:') return undefined;
      if (parsed.username || parsed.password) return undefined;

      const isAllowedHost = ledgeAiConfig.allowedArticleHosts.some(
        (host) => parsed.hostname === host
      );
      if (!isAllowedHost) return undefined;

      if (!parsed.pathname.startsWith('/articles/')) return undefined;

      return parsed.href;
    } catch (error) {
      if (ledgeAiConfig.debug) {
        logger.debug(
          `[Ledge.ai] URL validation error for "${href}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }

  validateThumbnailUrl(src: string | undefined): string | undefined {
    if (!src) return undefined;

    const trimmed = src.trim();
    if (!trimmed || /\s/.test(trimmed)) return undefined;

    if (trimmed.length > ledgeAiConfig.maxUrlLength) return undefined;

    const lowerSrc = trimmed.toLowerCase();
    for (const protocol of DANGEROUS_PROTOCOLS) {
      if (lowerSrc.startsWith(protocol)) return undefined;
    }

    try {
      const parsed = new URL(trimmed);

      if (parsed.protocol !== 'https:') return undefined;
      if (parsed.username || parsed.password) return undefined;

      const isAllowedHost = ledgeAiConfig.allowedThumbnailHosts.some(
        (host) => parsed.hostname === host
      );
      if (!isAllowedHost) return undefined;

      return parsed.href;
    } catch (error) {
      if (ledgeAiConfig.debug) {
        logger.debug(
          `[Ledge.ai] Thumbnail URL validation error for "${trimmed}": ${error instanceof Error ? error.message : 'Unknown'}`
        );
      }
      return undefined;
    }
  }
}
