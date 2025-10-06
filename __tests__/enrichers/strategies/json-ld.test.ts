import * as cheerio from 'cheerio';
import { extractFromJsonLd } from '@/lib/enrichers/strategies/json-ld';

describe('JSON-LD extraction', () => {
  describe('extractFromJsonLd', () => {
    it('should extract articleBody from JSON-LD', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Article",
                "articleBody": "This is the article body content from JSON-LD."
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBe('This is the article body content from JSON-LD.');
    });

    it('should extract description when articleBody not available', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "WebPage",
                "description": "This is the description content."
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBe('This is the description content.');
    });

    it('should handle @graph structure', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@graph": [
                  { "@type": "Organization", "name": "Example" },
                  { "@type": "Article", "articleBody": "Content from @graph" }
                ]
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBe('Content from @graph');
    });

    it('should handle array of JSON-LD', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              [
                { "@type": "Organization", "name": "Example" },
                { "@type": "Article", "articleBody": "Content from array" }
              ]
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBe('Content from array');
    });

    it('should return null when no JSON-LD present', () => {
      const html = '<html><head></head><body></body></html>';

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBeNull();
    });

    it('should handle malformed JSON gracefully', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              { invalid json }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBeNull();
    });

    it('should prioritize articleBody over description', () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@type": "Article",
                "articleBody": "Article body content",
                "description": "Description content"
              }
            </script>
          </head>
          <body></body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromJsonLd($);

      expect(result).toBe('Article body content');
    });
  });
});
