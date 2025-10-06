import * as cheerio from 'cheerio';
import { extractFromSelectors } from '@/lib/enrichers/strategies/selectors';

describe('Selectors extraction', () => {
  describe('extractFromSelectors', () => {
    it('should extract from article element', () => {
      const html = `
        <html>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>${'Lorem ipsum. '.repeat(20)}</p>
            </article>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 100);

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(200);
    });

    it('should extract from main element', () => {
      const html = `
        <html>
          <body>
            <main>
              <p>${'Content in main element. '.repeat(15)}</p>
            </main>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 100);

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(200);
    });

    it('should remove noise elements', () => {
      const html = `
        <html>
          <body>
            <article>
              <nav>Navigation to remove</nav>
              <aside>Sidebar to remove</aside>
              <p>${'Main content here. '.repeat(15)}</p>
              <div class="sidebar">Another sidebar to remove</div>
            </article>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 100);

      expect(result).not.toBeNull();
      expect(result).not.toContain('Navigation');
      expect(result).not.toContain('Sidebar');
      expect(result).toContain('Main content');
    });

    it('should return null when content too short', () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short</p>
            </article>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 200);

      expect(result).toBeNull();
    });

    it('should try multiple selectors in order', () => {
      const html = `
        <html>
          <body>
            <div class="entry-content">
              <p>${'Content in .entry-content. '.repeat(15)}</p>
            </div>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 100);

      expect(result).not.toBeNull();
      expect(result).toContain('entry-content');
    });

    it('should handle role attributes', () => {
      const html = `
        <html>
          <body>
            <div role="main">
              <p>${'Content with role=main. '.repeat(15)}</p>
            </div>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromSelectors($, 100);

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(200);
    });
  });
});
