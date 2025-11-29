/**
 * Tests for GoogleAIEnricher
 */

import { GoogleAIEnricher } from '@/lib/enrichers/google-ai';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('GoogleAIEnricher', () => {
  let enricher: GoogleAIEnricher;

  beforeEach(() => {
    enricher = new GoogleAIEnricher();
    mockFetch.mockReset();
  });

  describe('canHandle', () => {
    it('should handle blog.google AI-related URLs', () => {
      expect(enricher.canHandle('https://blog.google/technology/ai/gemini-update/')).toBe(true);
      expect(enricher.canHandle('https://blog.google/technology/google-deepmind/alphafold/')).toBe(
        true
      );
      expect(enricher.canHandle('https://blog.google/technology/developers/new-api/')).toBe(true);
    });

    it('should handle blog.google product URLs', () => {
      expect(enricher.canHandle('https://blog.google/products/search/new-feature/')).toBe(true);
      expect(enricher.canHandle('https://blog.google/products/pixel/announcement/')).toBe(true);
    });

    it('should handle blog.google regional URLs', () => {
      expect(enricher.canHandle('https://blog.google/around-the-globe/google-asia/event/')).toBe(
        true
      );
      expect(enricher.canHandle('https://blog.google/intl/ja/news/')).toBe(true);
    });

    it('should handle inside-google and outreach URLs', () => {
      expect(enricher.canHandle('https://blog.google/inside-google/announcement/')).toBe(true);
      expect(enricher.canHandle('https://blog.google/outreach-initiatives/education/')).toBe(true);
    });

    it('should not handle non-blog.google URLs', () => {
      expect(enricher.canHandle('https://ai.google/research/')).toBe(false);
      expect(enricher.canHandle('https://developers.googleblog.com/post/')).toBe(false);
      expect(enricher.canHandle('https://example.com/blog.google/')).toBe(false);
    });
  });

  describe('enrich', () => {
    const testUrl = 'https://blog.google/technology/ai/test-article/';

    it('should extract content using new selectors', async () => {
      const htmlWithNewStructure = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article</title>
          <meta property="og:image" content="https://blog.google/thumb.jpg">
        </head>
        <body>
          <article>
            <div data-test-id="post-body">
              This is the main article content that is long enough to pass the minimum threshold of 300 characters.
              It contains multiple sentences about Google AI and its latest developments in machine learning.
              The content continues with more details about the announcement and its implications for developers.
              Here is even more content to make sure we pass the 300 character minimum requirement for this test case.
              Additional paragraph with more information about the Google AI Blog article content extraction.
            </div>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithNewStructure,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content?.length).toBeGreaterThanOrEqual(300);
      expect(result?.content).toContain('main article content');
      expect(result?.thumbnail).toBe('https://blog.google/thumb.jpg');
    });

    it('should fall back to JSON-LD when selectors fail', async () => {
      const htmlWithJsonLd = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>JSON-LD Article</title>
          <script type="application/ld+json">
          {
            "@type": "NewsArticle",
            "headline": "Test Headline for JSON-LD Article",
            "description": "This is a detailed description of the article that contains enough content to pass the minimum threshold. It describes the main points of the article.",
            "author": {
              "@type": "Person",
              "name": "Test Author"
            }
          }
          </script>
          <meta property="og:image" content="https://blog.google/json-thumb.jpg">
        </head>
        <body>
          <div>Minimal content</div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithJsonLd,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Test Headline');
      expect(result?.content).toContain('detailed description');
      expect(result?.content).toContain('Author: Test Author');
    });

    it('should handle JSON-LD with @graph array', async () => {
      const htmlWithGraphJsonLd = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                "name": "Page Name"
              },
              {
                "@type": "BlogPosting",
                "headline": "Blog Post from Graph",
                "description": "This is the blog post description that is extracted from the @graph array. It contains sufficient content to meet the minimum requirements for the enricher to accept it as valid article content for processing."
              }
            ]
          }
          </script>
          <meta property="og:image" content="https://blog.google/graph-thumb.jpg">
        </head>
        <body></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithGraphJsonLd,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Blog Post from Graph');
    });

    it('should fall back to legacy selectors', async () => {
      const htmlWithLegacyStructure = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Legacy Article</title>
          <meta property="og:image" content="https://blog.google/legacy-thumb.jpg">
        </head>
        <body>
          <article>
            <div class="blog-content">
              This is legacy blog content that uses the older Google Blog structure and formatting patterns.
              It should still be extracted properly using the fallback selectors that handle older content.
              Additional content paragraphs to reach the minimum character requirement of 300 for this test case.
              More sentences and details to ensure we have enough content for the enricher to process successfully.
              The enricher should detect this content and extract it properly using the legacy selector fallback mechanism.
            </div>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithLegacyStructure,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('legacy blog content');
    });

    it('should return content with thumbnail even if below threshold', async () => {
      const htmlWithThinContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="https://blog.google/thin-thumb.jpg">
        </head>
        <body>
          <article>Short content only.</article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithThinContent,
      });

      const result = await enricher.enrich(testUrl);

      // Should return with thumbnail even if content is thin
      expect(result).not.toBeNull();
      expect(result?.thumbnail).toBe('https://blog.google/thin-thumb.jpg');
    });

    it('should return null when no content and no thumbnail', async () => {
      const emptyHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Empty</title></head>
        <body></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => emptyHtml,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it('should handle malformed JSON-LD gracefully', async () => {
      const htmlWithBadJsonLd = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          { invalid json content
          </script>
          <meta property="og:image" content="https://blog.google/bad-json-thumb.jpg">
        </head>
        <body>
          <article>
            <div class="entry-content">
              Valid fallback content that should be extracted despite the malformed JSON-LD structured data.
              This content is long enough to pass the minimum character threshold of 300 for extraction to work.
              Additional text and sentences to ensure sufficient length for the test to pass properly and completely.
              The enricher should gracefully handle the JSON parse error and fall back to HTML selector extraction.
              More content here to make absolutely sure we exceed the 300 character minimum requirement threshold.
            </div>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlWithBadJsonLd,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Valid fallback content');
    });
  });
});
