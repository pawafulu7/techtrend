import { BaseContentEnricher, EnrichmentResult } from './base';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import logger from '@/lib/logger';
import {
  extractWithReadability,
  extractFromJsonLd,
  extractFromSelectors,
  extractFromParagraphs,
  extractFromMetadata,
  isHighQuality,
  isMinimumViable,
} from './strategies';

interface StrategyResult {
  content: string;
  thumbnail?: string;
  detail?: string;
}

export class GenericContentEnricher extends BaseContentEnricher {
  canHandle(_url: string): boolean {
    return true;
  }

  async enrich(url: string): Promise<EnrichmentResult | null> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            DNT: '1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          if (response.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
            continue;
          }
          if (attempt === maxRetries) {
            return null;
          }
          continue;
        }

        const html = await response.text();
        const baseUrl = response.url || url;

        const $ = cheerio.load(html);
        $('script:not([type="application/ld+json"]), style, noscript, iframe').remove();

        const metadata = this.extractMetadata($);
        let thumbnail = this.resolveThumbnail(
          metadata.ogImage || metadata.twitterImage,
          baseUrl,
          $
        );

        let content = '';

        // Strategy 1: Readability (highest priority)
        const readabilityResult = await this.tryStrategy(
          'readability',
          async () => {
            const result = await extractWithReadability(html, baseUrl);
            return result
              ? { content: result.content, thumbnail: result.thumbnail }
              : null;
          }
        );

        if (readabilityResult && isHighQuality(readabilityResult.content)) {
          content = readabilityResult.content;
          thumbnail = readabilityResult.thumbnail || thumbnail;
        }

        // Strategy 2-5: Legacy heuristics (fallback)
        if (!content || !isHighQuality(content)) {
          const legacyResult = await this.tryLegacyStrategies($, metadata);
          if (legacyResult) {
            content = legacyResult.content;
          }
        }

        content = this.cleanupContent(content);

        if (!isMinimumViable(content)) {
          if (attempt === maxRetries) {
            return null;
          }
          continue;
        }

        return {
          content,
          thumbnail,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error && error.name === 'AbortError'
            ? 'Request timeout'
            : 'Request failed';

        logger.error(
          { error, url, attempt, maxRetries },
          `[GenericEnricher] ${errorMessage}`
        );

        if (attempt === maxRetries) {
          return null;
        }
      }
    }

    return null;
  }

  private async tryStrategy(
    name: string,
    extractor: () => Promise<StrategyResult | null>
  ): Promise<StrategyResult | null> {
    const startTime = Date.now();
    try {
      const result = await extractor();
      const duration = Date.now() - startTime;

      if (result?.content) {
        logger.debug(
          {
            strategy: name,
            length: result.content.length,
            duration,
          },
          'Extraction succeeded'
        );
        return result;
      }

      logger.debug(
        {
          strategy: name,
          duration,
          reason: result?.detail || 'no_content',
        },
        'Extraction failed'
      );
      return null;
    } catch (error) {
      logger.debug(
        {
          strategy: name,
          error: error instanceof Error ? error.message : String(error),
        },
        'Extraction error'
      );
      return null;
    }
  }

  private async tryLegacyStrategies(
    $: CheerioAPI,
    metadata: ReturnType<typeof this.extractMetadata>
  ): Promise<StrategyResult | null> {
    // Strategy 2: JSON-LD
    const jsonLdContent = await this.tryStrategy('json-ld', async () => {
      const content = extractFromJsonLd($);
      return content ? { content } : null;
    });
    if (jsonLdContent) return jsonLdContent;

    // Strategy 3: Selectors
    const selectorContent = await this.tryStrategy('selectors', async () => {
      const content = extractFromSelectors($, 200);
      return content ? { content } : null;
    });
    if (selectorContent) return selectorContent;

    // Strategy 4: Paragraphs
    const paragraphContent = await this.tryStrategy('paragraphs', async () => {
      const content = extractFromParagraphs($, 50);
      return content ? { content } : null;
    });
    if (paragraphContent) return paragraphContent;

    // Strategy 5: Metadata
    const metadataContent = await this.tryStrategy('metadata', async () => {
      const content = extractFromMetadata($, {
        title: metadata.title,
        ogTitle: metadata.ogTitle,
        ogDescription: metadata.ogDescription,
        metaDescription: metadata.metaDescription,
        twitterDescription: metadata.twitterDescription,
      });
      return content ? { content } : null;
    });
    return metadataContent;
  }

  private extractMetadata($: CheerioAPI) {
    return {
      ogTitle: $('meta[property="og:title"]').attr('content'),
      ogDescription: $('meta[property="og:description"]').attr('content'),
      ogImage: $('meta[property="og:image"]').attr('content'),
      twitterDescription: $('meta[name="twitter:description"]').attr('content'),
      twitterImage: $('meta[name="twitter:image"]').attr('content'),
      metaDescription: $('meta[name="description"]').attr('content'),
      title: $('title').text().trim(),
    };
  }

  private resolveThumbnail(
    thumbnail: string | undefined,
    baseUrl: string,
    $: CheerioAPI
  ): string | undefined {
    if (thumbnail) {
      try {
        return new URL(thumbnail, baseUrl).toString();
      } catch {
        return thumbnail;
      }
    }
    return this.findFirstImage($, baseUrl) || undefined;
  }

  private findFirstImage(
    $: CheerioAPI,
    baseUrl: string
  ): string | undefined {
    const imageSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'article img',
      'main img',
      '.content img',
      'img[src*="thumbnail"]',
      'img[src*="featured"]',
      'img',
    ];

    for (const selector of imageSelectors) {
      const img = $(selector).first();
      if (img.length) {
        const src =
          img.attr('src') || img.attr('data-src') || img.attr('content');
        if (
          src &&
          !src.includes('logo') &&
          !src.includes('icon') &&
          !src.includes('avatar')
        ) {
          try {
            return new URL(src, baseUrl).toString();
          } catch {
            return src;
          }
        }
      }
    }

    return undefined;
  }

  private cleanupContent(content: string): string {
    return content
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim()
      .substring(0, 50000);
  }
}
