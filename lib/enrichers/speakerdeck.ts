/**
 * Speaker Deck Content Enricher
 * Speaker Deck slide presentations content enrichment via oEmbed API
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import logger from '@/lib/logger';
import * as cheerio from 'cheerio';

interface OEmbedResponse {
  type: string;
  version: string;
  title: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html: string;
  width: number;
  height: number;
  ratio: number;
}

export class SpeakerDeckEnricher extends BaseContentEnricher {
  private oEmbedEndpoint = 'https://speakerdeck.com/oembed.json';

  canHandle(url: string): boolean {
    return isUrlFromDomain(url, 'speakerdeck.com');
  }

  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      // Strategy 1: Try oEmbed API first (most reliable)
      const oEmbedData = await this.fetchOEmbed(url);

      if (oEmbedData) {
        const content = this.buildContentFromOEmbed(oEmbedData, url);
        const thumbnail = oEmbedData.thumbnail_url || null;

        if (this.isContentSufficient(content, 50)) {
          logger.debug(
            { url, contentLength: content.length, source: 'oembed' },
            '[SpeakerDeckEnricher] Enrichment succeeded via oEmbed'
          );
          return { content, thumbnail };
        }
      }

      // Strategy 2: Fallback to HTML scraping
      logger.debug({ url }, '[SpeakerDeckEnricher] Falling back to HTML scraping');
      const html = await this.fetchWithRetry(url);
      return this.extractFromHtml(html, url);
    } catch (error) {
      logger.error(
        { error, url },
        '[SpeakerDeckEnricher] Enrichment failed'
      );
      return null;
    }
  }

  private async fetchOEmbed(url: string): Promise<OEmbedResponse | null> {
    try {
      const oEmbedUrl = `${this.oEmbedEndpoint}?url=${encodeURIComponent(url)}`;

      const response = await fetch(oEmbedUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TechTrend/1.0 ContentEnricher',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.debug(
          { status: response.status, url },
          '[SpeakerDeckEnricher] oEmbed request failed'
        );
        return null;
      }

      const data = (await response.json()) as OEmbedResponse;

      // Validate required fields
      if (!data.title) {
        logger.debug({ url }, '[SpeakerDeckEnricher] oEmbed response missing title');
        return null;
      }

      return data;
    } catch (error) {
      logger.debug(
        { error, url },
        '[SpeakerDeckEnricher] oEmbed fetch error'
      );
      return null;
    }
  }

  private buildContentFromOEmbed(data: OEmbedResponse, originalUrl: string): string {
    const parts: string[] = [];

    // Title (required)
    parts.push(data.title);

    // Author information
    if (data.author_name) {
      parts.push(`Speaker: ${data.author_name}`);
    }

    // Extract slide count from embed HTML if available
    const slideCount = this.extractSlideCountFromEmbed(data.html);
    if (slideCount) {
      parts.push(`Slides: ${slideCount}`);
    }

    // Platform info
    parts.push(`Platform: ${data.provider_name || 'Speaker Deck'}`);

    // URL for reference
    parts.push(`URL: ${originalUrl}`);

    return parts.join('\n\n');
  }

  private extractSlideCountFromEmbed(embedHtml: string): number | null {
    // Speaker Deck embed HTML sometimes contains slide count info
    // Try to extract from data attributes or known patterns
    const slideCountMatch = embedHtml.match(/data-slide-count="(\d+)"/);
    if (slideCountMatch) {
      return parseInt(slideCountMatch[1], 10);
    }

    return null;
  }

  private extractFromHtml(html: string, url: string): EnrichedContent | null {
    const $ = cheerio.load(html);

    // Extract thumbnail from meta tags
    const thumbnail = this.extractThumbnail(html);

    // Build content from meta tags and page elements
    const parts: string[] = [];

    // Title from og:title or page title
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const pageTitle = $('title').text().trim();
    const title = ogTitle || pageTitle;
    if (title) {
      parts.push(title.replace(' - Speaker Deck', '').trim());
    }

    // Description from og:description or meta description
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const metaDescription = $('meta[name="description"]').attr('content');
    const description = ogDescription || metaDescription;
    if (description && description.length > 10) {
      parts.push(description);
    }

    // Author from page content
    const authorLink = $('.deck-author a, .speaker-name, [data-testid="author"]').first();
    if (authorLink.length) {
      const authorName = authorLink.text().trim();
      if (authorName) {
        parts.push(`Speaker: ${authorName}`);
      }
    }

    // Deck description if available
    const deckDescription = $('.deck-description, .presentation-description').text().trim();
    if (deckDescription && deckDescription.length > 20) {
      parts.push(deckDescription);
    }

    parts.push(`Platform: Speaker Deck`);
    parts.push(`URL: ${url}`);

    const content = parts.join('\n\n');

    if (this.isContentSufficient(content, 50)) {
      logger.debug(
        { url, contentLength: content.length, source: 'html' },
        '[SpeakerDeckEnricher] Enrichment succeeded via HTML'
      );
      return { content, thumbnail };
    }

    // Even if content is minimal, return with thumbnail if available
    if (thumbnail) {
      return { content, thumbnail };
    }

    logger.debug({ url }, '[SpeakerDeckEnricher] Insufficient content');
    return null;
  }
}
