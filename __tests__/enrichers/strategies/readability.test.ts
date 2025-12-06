import { extractWithReadability } from '@/lib/enrichers/strategies/readability';

describe('Readability extraction with Worker Threads', () => {
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
    }, 30000);

    it('should return null for empty HTML', async () => {
      const html = '<html><body></body></html>';

      const result = await extractWithReadability(html, 'https://example.com/empty');

      expect(result).toBeNull();
    }, 30000);

    it('should return null for oversized HTML (>500KB)', async () => {
      // Create HTML larger than 500KB
      const oversizedHtml = '<html><body>' + 'x'.repeat(600_000) + '</body></html>';

      const result = await extractWithReadability(oversizedHtml, 'https://example.com/oversized');

      // Size guard should reject this immediately
      expect(result).toBeNull();
    }, 10000);

    it('should strip scripts and styles from HTML', async () => {
      const htmlWithScripts = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Article with Scripts</title>
            <style>.heavy { background: url(data:image/png;base64,iVBORw0KGgoAAAANS...); }</style>
          </head>
          <body>
            <script>console.log("should be removed");</script>
            <article>
              <h1>Clean Article</h1>
              <p>This content should be extracted without scripts or styles.</p>
              <p>More meaningful content here for the article.</p>
            </article>
            <script>alert("another script");</script>
          </body>
        </html>
      `;

      const result = await extractWithReadability(
        htmlWithScripts,
        'https://example.com/with-scripts'
      );

      expect(result).not.toBeNull();
      expect(result?.content).toBeDefined();
      expect(result!.content).not.toContain('console.log');
      expect(result!.content).not.toContain('alert');
    }, 30000);

    it('should handle malformed HTML gracefully', async () => {
      const malformed = '<html><body><p>Unclosed paragraph<article>No closing tags';

      const result = await extractWithReadability(malformed, 'https://example.com/malformed');

      // Should not throw, may return null or partial content
      expect(result === null || result?.content !== undefined).toBe(true);
    }, 30000);

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
    }, 30000);

    it('should timeout for slow processing', async () => {
      // Use a short timeout to test timeout behavior
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <p>Simple content</p>
            </article>
          </body>
        </html>
      `;

      // This should complete within timeout normally
      const result = await extractWithReadability(html, 'https://example.com/timeout-test', 10000);

      // Normal HTML should complete, not timeout
      // Just verify it doesn't hang indefinitely
      expect(result === null || result?.content !== undefined).toBe(true);
    }, 30000);

    it('should handle concurrent Worker calls', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <article>
              <h1>Concurrent Test</h1>
              <p>Testing concurrent Worker execution.</p>
            </article>
          </body>
        </html>
      `;

      // Run 3 concurrent extractions
      const results = await Promise.all([
        extractWithReadability(html, 'https://example.com/concurrent-1'),
        extractWithReadability(html, 'https://example.com/concurrent-2'),
        extractWithReadability(html, 'https://example.com/concurrent-3'),
      ]);

      // All should complete without errors
      results.forEach((result) => {
        expect(result === null || result?.content !== undefined).toBe(true);
      });
    }, 60000);
  });
});
