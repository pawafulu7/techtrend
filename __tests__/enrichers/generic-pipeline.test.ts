import { GenericContentEnricher } from '@/lib/enrichers/generic';

jest.mock('@/lib/enrichers/strategies', () => {
  const actual = jest.requireActual('@/lib/enrichers/strategies');
  return {
    ...actual,
    extractWithReadability: jest.fn(actual.extractWithReadability),
    extractFromJsonLd: jest.fn(actual.extractFromJsonLd),
    extractFromSelectors: jest.fn(actual.extractFromSelectors),
    extractFromParagraphs: jest.fn(actual.extractFromParagraphs),
    extractFromMetadata: jest.fn(actual.extractFromMetadata),
  };
});

describe('GenericContentEnricher Pipeline', () => {
  let enricher: GenericContentEnricher;

  beforeEach(() => {
    enricher = new GenericContentEnricher();
    jest.clearAllMocks();
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
      const strategies = jest.requireMock('@/lib/enrichers/strategies') as jest.Mocked<
        typeof import('@/lib/enrichers/strategies')
      >;

      strategies.extractWithReadability.mockResolvedValueOnce(null);
      strategies.extractFromJsonLd.mockReturnValueOnce(null);
      strategies.extractFromSelectors.mockReturnValueOnce(
        'Selector extracted content. '.repeat(15)
      );

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/strategy-order',
        text: async () => '<html><body><main>Content</main></body></html>',
      } as Response);

      const result = await enricher.enrich('https://example.com/strategy-order');

      expect(strategies.extractWithReadability).toHaveBeenCalled();
      expect(strategies.extractFromJsonLd).toHaveBeenCalled();
      expect(strategies.extractFromSelectors).toHaveBeenCalled();

      const readabilityOrder =
        strategies.extractWithReadability.mock.invocationCallOrder[0]!;
      const jsonLdOrder =
        strategies.extractFromJsonLd.mock.invocationCallOrder[0]!;
      const selectorsOrder =
        strategies.extractFromSelectors.mock.invocationCallOrder[0]!;

      expect(readabilityOrder).toBeLessThan(jsonLdOrder);
      expect(jsonLdOrder).toBeLessThan(selectorsOrder);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Selector extracted');
    }, 15000);
  });

  describe('Strategy order and priority', () => {
    it('should prioritize Readability and skip others when it succeeds', async () => {
      const strategies = jest.requireMock('@/lib/enrichers/strategies') as jest.Mocked<
        typeof import('@/lib/enrichers/strategies')
      >;

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

      expect(strategies.extractWithReadability).toHaveBeenCalled();
      expect(strategies.extractFromJsonLd).not.toHaveBeenCalled();
      expect(strategies.extractFromSelectors).not.toHaveBeenCalled();
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

    it('should respect high quality gate (>=400 chars)', async () => {
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

    it('should accept medium quality (>=250 chars, >=2 sentences)', async () => {
      const mediumQualityHTML = `
        <html>
          <body>
            <article>
              <p>${'Medium quality content. '.repeat(12)}</p>
              <p>Another sentence here.</p>
            </article>
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/medium-quality',
        text: async () => mediumQualityHTML,
      } as Response);

      const result = await enricher.enrich('https://example.com/medium-quality');

      expect(result).not.toBeNull();
      expect(result!.content.length).toBeGreaterThanOrEqual(250);
      expect(result!.content.length).toBeLessThan(400);
    });

    it('should accept minimum viable (>=50 chars)', async () => {
      const minimalHTML = `
        <html>
          <body>
            <article>
              <p>${'Minimal content that just meets threshold. '.repeat(2)}</p>
            </article>
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/minimal',
        text: async () => minimalHTML,
      } as Response);

      const result = await enricher.enrich('https://example.com/minimal');

      expect(result).not.toBeNull();
      expect(result!.content.length).toBeGreaterThanOrEqual(50);
    });

    it('should reject content below minimum (<50 chars)', async () => {
      const tooShortHTML = `
        <html>
          <body>
            <article>
              <p>Too short</p>
            </article>
          </body>
        </html>
      `;

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        url: 'https://example.com/too-short',
        text: async () => tooShortHTML,
      } as Response);

      const result = await enricher.enrich('https://example.com/too-short');

      expect(result).toBeNull();
    });
  });
});
