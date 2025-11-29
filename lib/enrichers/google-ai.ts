/**
 * Google AI Blog Content Enricher
 * Google AI Blog and blog.google content extraction
 *
 * Supports multiple blog.google URL patterns and uses multiple
 * fallback strategies for content extraction.
 */

import { BaseContentEnricher, EnrichedContent } from './base';
import { isUrlFromDomain } from '@/lib/utils/url-validator';
import * as cheerio from 'cheerio';
import logger from '@/lib/logger';

export class GoogleAIEnricher extends BaseContentEnricher {
  /**
   * Check if URL matches Google Blog patterns
   */
  canHandle(url: string): boolean {
    return (
      isUrlFromDomain(url, 'blog.google') &&
      (url.includes('/technology/ai/') ||
        url.includes('/technology/google-deepmind/') ||
        url.includes('/technology/developers/') ||
        url.includes('/products/') ||
        url.includes('/intl/') ||
        url.includes('/inside-google/') ||
        url.includes('/around-the-globe/') ||
        url.includes('/outreach-initiatives/'))
    );
  }

  /**
   * Extract content from Google Blog article pages
   */
  async enrich(url: string): Promise<EnrichedContent | null> {
    try {
      const html = await this.fetchWithRetry(url);
      const thumbnail = this.extractThumbnail(html);

      // Strategy 1: New blog.google structure selectors (highest priority)
      const newSelectors = [
        'article [data-test-id="post-body"]',
        'article [itemprop="articleBody"]',
        'article section',
        '.article__body',
        '.post-body',
        '[data-test-id="article-content"]',
      ];

      let content = this.sanitizeContent(html, newSelectors);
      let strategy = 'new-selectors';

      // Strategy 2: JSON-LD extraction
      if (!this.isContentSufficient(content, 300)) {
        const jsonLdContent = this.extractFromJsonLd(html);
        if (jsonLdContent && jsonLdContent.length > (content?.length || 0)) {
          content = jsonLdContent;
          strategy = 'json-ld';
        }
      }

      // Strategy 3: Legacy selectors
      if (!this.isContentSufficient(content, 300)) {
        const legacySelectors = [
          'article .blog-content',
          '.article-content',
          '.post-content',
          '.blog-post-content',
          '.rich-text',
          '.blogv2-content',
          'main article',
          'article main',
          '.content-wrapper',
          '#article-content',
          '.entry-content',
          'div[role="article"]',
        ];
        const legacyContent = this.sanitizeContent(html, legacySelectors);
        if (legacyContent && legacyContent.length > (content?.length || 0)) {
          content = legacyContent;
          strategy = 'legacy-selectors';
        }
      }

      // Strategy 4: Wide fallback (article/main tags)
      if (!this.isContentSufficient(content, 300)) {
        const fallbackContent = this.extractWithFallback(html);
        if (fallbackContent && fallbackContent.length > (content?.length || 0)) {
          content = fallbackContent;
          strategy = 'wide-fallback';
        }
      }

      // Relaxed minimum: 300 characters (was 500)
      if (!this.isContentSufficient(content, 300)) {
        logger.debug(
          { url, contentLength: content?.length || 0 },
          '[GoogleAIEnricher] Insufficient content'
        );

        // Return with thumbnail even if content is thin
        if (thumbnail) {
          return { content: content || null, thumbnail };
        }

        return null;
      }

      logger.debug(
        { url, contentLength: content.length, strategy },
        '[GoogleAIEnricher] Enrichment succeeded'
      );

      return { content, thumbnail };
    } catch (error) {
      logger.error({ error, url }, '[GoogleAIEnricher] Enrichment failed');
      return null;
    }
  }

  /**
   * Extract article content from JSON-LD structured data
   */
  private extractFromJsonLd(html: string): string | null {
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < scripts.length; i++) {
      try {
        const scriptContent = $(scripts[i]).html();
        if (!scriptContent) continue;

        const data = JSON.parse(scriptContent);

        // Direct type match
        if (this.isArticleType(data['@type'])) {
          const extracted = this.extractContentFromJsonLdObject(data);
          if (extracted) return extracted;
        }

        // Check @graph array (common in Google's structured data)
        if (Array.isArray(data['@graph'])) {
          for (const item of data['@graph']) {
            if (this.isArticleType(item['@type'])) {
              const extracted = this.extractContentFromJsonLdObject(item);
              if (extracted) return extracted;
            }
          }
        }
      } catch {
        // JSON parse errors are expected for non-JSON-LD scripts
        continue;
      }
    }

    return null;
  }

  /**
   * Check if type indicates an article
   */
  private isArticleType(type: unknown): boolean {
    if (typeof type === 'string') {
      return ['NewsArticle', 'BlogPosting', 'Article', 'TechArticle'].includes(type);
    }
    if (Array.isArray(type)) {
      return type.some(
        (t) =>
          typeof t === 'string' &&
          ['NewsArticle', 'BlogPosting', 'Article', 'TechArticle'].includes(t)
      );
    }
    return false;
  }

  /**
   * Extract content from a JSON-LD object
   */
  private extractContentFromJsonLdObject(obj: Record<string, unknown>): string | null {
    // Priority 1: articleBody (full content)
    if (typeof obj.articleBody === 'string' && obj.articleBody.length > 100) {
      return obj.articleBody;
    }

    // Priority 2: Combine headline + description
    const parts: string[] = [];

    if (typeof obj.headline === 'string') {
      parts.push(obj.headline);
    }

    if (typeof obj.description === 'string' && obj.description.length > 50) {
      parts.push(obj.description);
    }

    // Include author if available
    if (obj.author) {
      const authorName = this.extractAuthorName(obj.author);
      if (authorName) {
        parts.push(`Author: ${authorName}`);
      }
    }

    if (parts.length >= 2) {
      return parts.join('\n\n');
    }

    return null;
  }

  /**
   * Extract author name from various JSON-LD author formats
   */
  private extractAuthorName(author: unknown): string | null {
    if (typeof author === 'string') {
      return author;
    }
    if (typeof author === 'object' && author !== null) {
      const authorObj = author as Record<string, unknown>;
      if (typeof authorObj.name === 'string') {
        return authorObj.name;
      }
    }
    if (Array.isArray(author) && author.length > 0) {
      const first = author[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first !== null) {
        const obj = first as Record<string, unknown>;
        if (typeof obj.name === 'string') return obj.name;
      }
    }
    return null;
  }

  /**
   * Wide fallback: extract from article/main tags
   */
  private extractWithFallback(html: string): string {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.container article',
      '.post',
      '.blog-post',
    ];

    return this.sanitizeContent(html, selectors);
  }
}
