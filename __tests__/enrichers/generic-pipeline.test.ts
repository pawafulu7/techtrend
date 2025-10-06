import { GenericContentEnricher } from '@/lib/enrichers/generic';

describe('GenericContentEnricher Pipeline', () => {
  let enricher: GenericContentEnricher;

  beforeEach(() => {
    enricher = new GenericContentEnricher();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Strategy pipeline', () => {
    it('should handle simple article HTML', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/article',
        text: async () => `
          <!DOCTYPE html>
          <html>
            <head><title>Test Article</title></head>
            <body>
              <article>
                <h1>Article Title</h1>
                <p>${'Lorem ipsum dolor sit amet. '.repeat(30)}</p>
              </article>
            </body>
          </html>
        `,
      } as Response);

      const result = await enricher.enrich('https://example.com/article');

      expect(result).not.toBeNull();
      expect(result?.content).toBeDefined();
      expect(result!.content.length).toBeGreaterThan(500);
    });

    it('should handle JSON-LD structured data', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/jsonld',
        text: async () => `
          <html>
            <head>
              <script type="application/ld+json">
                {
                  "@type": "Article",
                  "articleBody": "${'Article content from JSON-LD. '.repeat(40)}"
                }
              </script>
            </head>
            <body></body>
          </html>
        `,
      } as Response);

      const result = await enricher.enrich('https://example.com/jsonld');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('JSON-LD');
    });

    it('should return null for genuinely thin content', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/thin',
        text: async () => '<html><body><p>Short</p></body></html>',
      } as Response);

      const result = await enricher.enrich('https://example.com/thin');

      expect(result).toBeNull();
    }, 10000);

    it('should handle fetch errors gracefully', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await enricher.enrich('https://example.com/error');

      expect(result).toBeNull();
    }, 10000);

    it('should handle HTTP error status', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const result = await enricher.enrich('https://example.com/notfound');

      expect(result).toBeNull();
    }, 10000);
  });

  describe('Fallback behavior', () => {
    it('should try multiple strategies', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/fallback',
        text: async () => `
          <html>
            <body>
              <div>
                <p>${'Paragraph content. '.repeat(20)}</p>
              </div>
            </body>
          </html>
        `,
      } as Response);

      const result = await enricher.enrich('https://example.com/fallback');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Paragraph content');
    });

    it('should try strategies in order when previous ones fail', async () => {
      const strategies = require('@/lib/enrichers/strategies');

      const readabilitySpy = jest
        .spyOn(strategies, 'extractWithReadability')
        .mockResolvedValue(null);

      const jsonLdSpy = jest
        .spyOn(strategies, 'extractFromJsonLd')
        .mockReturnValue(null);

      const selectorsSpy = jest
        .spyOn(strategies, 'extractFromSelectors')
        .mockReturnValue('Selector extracted content. '.repeat(15));

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/strategy-order',
        text: async () => '<html><body><main>Content</main></body></html>',
      } as Response);

      const result = await enricher.enrich('https://example.com/strategy-order');

      expect(readabilitySpy).toHaveBeenCalled();
      expect(jsonLdSpy).toHaveBeenCalled();
      expect(selectorsSpy).toHaveBeenCalled();

      expect(readabilitySpy.mock.invocationCallOrder[0]).toBeLessThan(
        jsonLdSpy.mock.invocationCallOrder[0] || Infinity
      );
      expect((jsonLdSpy.mock.invocationCallOrder[0] || 0)).toBeLessThan(
        selectorsSpy.mock.invocationCallOrder[0] || Infinity
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Selector extracted');

      readabilitySpy.mockRestore();
      jsonLdSpy.mockRestore();
      selectorsSpy.mockRestore();
    }, 15000);
  });

  describe('Strategy order and priority', () => {
    it('should prioritize Readability strategy first', async () => {
      const readabilityContent = 'Readability extracted content. '.repeat(20);

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/readability-test',
        text: async () => `
          <html>
            <head>
              <script type="application/ld+json">
                {"@type": "Article", "articleBody": "JSON-LD content should be ignored"}
              </script>
            </head>
            <body>
              <article>
                <p>${readabilityContent}</p>
              </article>
            </body>
          </html>
        `,
      } as Response);

      const result = await enricher.enrich('https://example.com/readability-test');

      expect(result).not.toBeNull();
      expect(result!.content.length).toBeGreaterThan(400);
    });

    it('should fall back to JSON-LD when Readability fails', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/jsonld-fallback',
        text: async () => `
          <html>
            <head>
              <script type="application/ld+json">
                {"@type": "Article", "articleBody": "${'JSON-LD fallback content. '.repeat(30)}"}
              </script>
            </head>
            <body></body>
          </html>
        `,
      } as Response);

      const result = await enricher.enrich('https://example.com/jsonld-fallback');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('JSON-LD fallback');
    });

    it('should respect quality gate thresholds', async () => {
      const highQualityHTML = `
        <html>
          <body>
            <article>
              <p>${'High quality content with substantial information. '.repeat(10)}</p>
            </article>
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/high-quality',
        text: async () => highQualityHTML,
      } as Response);

      const result = await enricher.enrich('https://example.com/high-quality');

      expect(result).not.toBeNull();
      expect(result!.content.length).toBeGreaterThan(400);
    });
  });
});
