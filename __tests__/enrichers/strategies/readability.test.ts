import { extractWithReadability } from '@/lib/enrichers/strategies/readability';

describe('Readability extraction', () => {
  describe('extractWithReadability', () => {
    it('should extract content from simple HTML', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Article</title></head>
          <body>
            <article>
              <h1>Test Article Title</h1>
              <p>This is the first paragraph with meaningful content that should be extracted.</p>
              <p>This is the second paragraph with more details about the topic.</p>
              <p>And this is the third paragraph to make it substantial enough.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractWithReadability(html, 'https://example.com/article');

      expect(result).not.toBeNull();
      expect(result?.content).toBeDefined();
      expect(result!.content.length).toBeGreaterThan(100);
    });

    it('should return null for empty HTML', async () => {
      const html = '<html><body></body></html>';

      const result = await extractWithReadability(html, 'https://example.com/empty');

      expect(result).toBeNull();
    });

    it('should handle very large HTML', async () => {
      const hugeHtml = '<html><body>' + '<p>x</p>'.repeat(100000) + '</body></html>';

      const result = await extractWithReadability(hugeHtml, 'https://example.com/huge', 5000);

      // May succeed or timeout, both are acceptable for very large HTML
      if (result) {
        expect(result.content).toBeDefined();
      }
    }, 60000);

    it('should handle malformed HTML gracefully', async () => {
      const malformed = '<html><body><p>Unclosed paragraph<article>No closing tags';

      const result = await extractWithReadability(malformed, 'https://example.com/malformed');

      expect(result).toBeDefined();
    });

    it('should extract from article with rich structure', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Rich Article</title>
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
          <body>
            <nav>Navigation Menu</nav>
            <aside>Sidebar content to ignore</aside>
            <article>
              <header><h1>Main Title</h1></header>
              <section>
                <h2>Section 1</h2>
                <p>First section content with important information.</p>
                <p>More details in this section.</p>
              </section>
              <section>
                <h2>Section 2</h2>
                <p>Second section with different topic.</p>
                <p>Additional paragraphs here.</p>
              </section>
            </article>
            <footer>Footer content to ignore</footer>
          </body>
        </html>
      `;

      const result = await extractWithReadability(html, 'https://example.com/rich');

      expect(result).not.toBeNull();
      expect(result?.content).toBeDefined();
      expect(result!.content).toContain('First section content');
      expect(result!.content).toContain('Second section');
      expect(result!.content).not.toContain('Navigation Menu');
      expect(result!.content).not.toContain('Footer content');
    });
  });
});
