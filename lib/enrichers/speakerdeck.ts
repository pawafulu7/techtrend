/**
 * Speaker Deck Content Enricher
 *
 * 発表ページの Transcript 欄（スライドごとの文字起こし）を本文にする。発表ページの説明文や
 * oEmbed（タイトル・発表者）は多くが 100 文字に届かず、要約の対象から外れる（THIN_CONTENT）ため。
 * 文字起こしが無い資料（画像だけの PDF など）は、従来どおり oEmbed とページのメタ情報で作る
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url/url-validator';
import logger from '@/lib/logger';
import {
  fetchWithValidatedRedirects,
  readTextWithLimit,
} from '@/lib/utils/url/safe-redirect';
import * as cheerio from 'cheerio';
import {
  extractSpeakerDeckTranscript,
  speakerDeckTitle,
} from '@/lib/sources/speakerdeck-transcript';

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

  async enrich(
    url: string,
    externalSignal?: AbortSignal
  ): Promise<EnrichedContent | null> {
    try {
      // Strategy 1: 発表ページの文字起こし。取れなければ HTML は oEmbed のサムネイルの補いとメタ情報に使う
      let html: string | null = null;
      try {
        html = await this.fetchWithRetry(url, externalSignal);
      } catch (htmlError) {
        logger.debug(
          { err: htmlError, url },
          '[SpeakerDeckEnricher] Failed to fetch the deck page, falling back to oEmbed'
        );
      }

      if (html) {
        const fromTranscript = this.extractFromTranscript(html);
        if (fromTranscript) {
          logger.debug(
            {
              url,
              contentLength: fromTranscript.content.length,
              source: 'transcript',
            },
            '[SpeakerDeckEnricher] Enrichment succeeded via transcript'
          );
          return fromTranscript;
        }
      }

      // Strategy 2: oEmbed（タイトル・発表者）
      const oEmbedData = await this.fetchOEmbed(url, externalSignal);

      if (oEmbedData) {
        const content = this.buildContentFromOEmbed(oEmbedData, url);
        // oEmbed にサムネイルが無ければ、取れた HTML の og:image を使う
        const thumbnail =
          oEmbedData.thumbnail_url ||
          (html ? this.extractThumbnail(html) : null);

        if (this.isContentSufficient(content, 50)) {
          logger.debug(
            {
              url,
              contentLength: content.length,
              source: 'oembed',
              hasThumbnail: !!thumbnail,
            },
            '[SpeakerDeckEnricher] Enrichment succeeded via oEmbed'
          );
          return { content, thumbnail };
        }
      }

      // Strategy 3: ページのメタ情報
      if (!html) {
        // 発表ページも oEmbed も取れなかった（それぞれの失敗は debug に出している）
        logger.warn(
          { url },
          '[SpeakerDeckEnricher] Failed to fetch both the deck page and oEmbed'
        );
        return null;
      }
      return this.extractFromHtml(html, url);
    } catch (error) {
      logger.error(
        { err: error, url },
        '[SpeakerDeckEnricher] Enrichment failed'
      );
      return null;
    }
  }

  private async fetchOEmbed(
    url: string,
    externalSignal?: AbortSignal
  ): Promise<OEmbedResponse | null> {
    try {
      const oEmbedUrl = `${this.oEmbedEndpoint}?url=${encodeURIComponent(url)}`;

      const { response } = await fetchWithValidatedRedirects(oEmbedUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TechTrend/1.0 ContentEnricher',
        },
        signal: this.composeSignal(externalSignal, 30000),
      });

      if (!response.ok) {
        // 接続プールの socket 保持を避けるため body を drain
        await this.safeReleaseBody(response);
        logger.debug(
          { status: response.status, url },
          '[SpeakerDeckEnricher] oEmbed request failed'
        );
        return null;
      }

      const data = JSON.parse(
        await readTextWithLimit(response)
      ) as OEmbedResponse;

      // Validate required fields
      if (!data.title) {
        logger.debug(
          { url },
          '[SpeakerDeckEnricher] oEmbed response missing title'
        );
        return null;
      }

      return data;
    } catch (error) {
      logger.debug(
        { err: error, url },
        '[SpeakerDeckEnricher] oEmbed fetch error'
      );
      return null;
    }
  }

  private buildContentFromOEmbed(
    data: OEmbedResponse,
    originalUrl: string
  ): string {
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

  /** 発表ページの Transcript 欄から本文を作る。文字のあるスライドが1枚も無ければ null */
  private extractFromTranscript(
    html: string
  ): (EnrichedContent & { content: string }) | null {
    const content = extractSpeakerDeckTranscript(cheerio.load(html));
    return content ? { content, thumbnail: this.extractThumbnail(html) } : null;
  }

  private extractFromHtml(html: string, url: string): EnrichedContent | null {
    const $ = cheerio.load(html);

    // Extract thumbnail from meta tags
    const thumbnail = this.extractThumbnail(html);

    // Build content from meta tags and page elements
    const parts: string[] = [];

    const title = speakerDeckTitle($);
    if (title) {
      parts.push(title);
    }

    // Description from og:description or meta description
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const metaDescription = $('meta[name="description"]').attr('content');
    const description = ogDescription || metaDescription;
    if (description && description.length > 10) {
      parts.push(description);
    }

    // Author from page content
    const authorLink = $(
      '.deck-author a, .speaker-name, [data-testid="author"]'
    ).first();
    if (authorLink.length) {
      const authorName = authorLink.text().trim();
      if (authorName) {
        parts.push(`Speaker: ${authorName}`);
      }
    }

    // Deck description if available
    const deckDescription = $('.deck-description, .presentation-description')
      .text()
      .trim();
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
