import { GenericContentEnricher } from '@/lib/enrichers/generic';

describe('GenericContentEnricher Pipeline', () => {
  const enricher = new GenericContentEnricher();

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

      mockFetch.mockRestore();
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

      mockFetch.mockRestore();
    });

    it('should return null for genuinely thin content', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        url: 'https://example.com/thin',
        text: async () => '<html><body><p>Short</p></body></html>',
      } as Response);

      const result = await enricher.enrich('https://example.com/thin');

      expect(result).toBeNull();

      mockFetch.mockRestore();
    });

    it('should handle fetch errors gracefully', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await enricher.enrich('https://example.com/error');

      expect(result).toBeNull();

      mockFetch.mockRestore();
    });

    it('should handle HTTP error status', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const result = await enricher.enrich('https://example.com/notfound');

      expect(result).toBeNull();

      mockFetch.mockRestore();
    });
  });

  describe('Fallback behavior', () => {
    it('should try multiple strategies', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
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

      mockFetch.mockRestore();
    });
  });
});
