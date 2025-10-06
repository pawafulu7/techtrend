import * as cheerio from 'cheerio';
import { extractFromParagraphs } from '@/lib/enrichers/strategies/paragraphs';

describe('Paragraphs extraction', () => {
  describe('extractFromParagraphs', () => {
    it('should aggregate paragraphs', () => {
      const html = `
        <html>
          <body>
            <p>First paragraph with sufficient length for extraction.</p>
            <p>Second paragraph with more content to be included.</p>
            <p>Third paragraph adds even more information here.</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromParagraphs($, 30);

      expect(result).not.toBeNull();
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
      expect(result).toContain('Third paragraph');
      expect(result).toContain('\n\n');
    });

    it('should filter out short paragraphs', () => {
      const html = `
        <html>
          <body>
            <p>OK</p>
            <p>This is a long enough paragraph to be included in the extraction.</p>
            <p>Another good paragraph with sufficient content.</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromParagraphs($, 50);

      expect(result).not.toBeNull();
      expect(result).not.toContain('OK');
      expect(result).toContain('long enough paragraph');
    });

    it('should return null when no paragraphs found', () => {
      const html = '<html><body><div>No paragraphs here</div></body></html>';

      const $ = cheerio.load(html);
      const result = extractFromParagraphs($);

      expect(result).toBeNull();
    });

    it('should return null when all paragraphs too short', () => {
      const html = `
        <html>
          <body>
            <p>Short</p>
            <p>Too</p>
            <p>Brief</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromParagraphs($, 50);

      expect(result).toBeNull();
    });
  });
});
