import * as cheerio from 'cheerio';
import { extractFromMetadata } from '@/lib/enrichers/strategies/metadata';

describe('Metadata extraction', () => {
  describe('extractFromMetadata', () => {
    it('should combine OG and meta descriptions', () => {
      const html = `
        <html>
          <body>
            <p>Body content that will be included.</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {
        ogTitle: 'OG Title',
        ogDescription: 'OG Description',
        metaDescription: 'Meta Description',
      });

      expect(result).not.toBeNull();
      expect(result).toContain('OG Title');
      expect(result).toContain('OG Description');
      expect(result).toContain('Meta Description');
    });

    it('should deduplicate identical descriptions', () => {
      const html = '<html><body></body></html>';

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {
        ogDescription: 'Same description',
        metaDescription: 'Same description',
        twitterDescription: 'Same description',
      });

      expect(result).not.toBeNull();
      const occurrences = (result!.match(/Same description/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it('should include body text when available', () => {
      const html = `
        <html>
          <body>
            <p>${'Body paragraph content. '.repeat(50)}</p>
          </body>
        </html>
      `;

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {
        ogTitle: 'Title',
      });

      expect(result).not.toBeNull();
      expect(result).toContain('Body paragraph');
    });

    it('should limit body text to 1000 chars', () => {
      const longText = 'x'.repeat(2000);
      const html = `<html><body><p>${longText}</p></body></html>`;

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {});

      expect(result).not.toBeNull();
      const bodyPart = result!.split('\n\n').pop();
      expect(bodyPart!.length).toBeLessThanOrEqual(1000);
    });

    it('should return null when no metadata available', () => {
      const html = '<html><body></body></html>';

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {});

      expect(result).toBeNull();
    });

    it('should prioritize ogTitle over title', () => {
      const html = '<html><body></body></html>';

      const $ = cheerio.load(html);
      const result = extractFromMetadata($, {
        title: 'HTML Title',
        ogTitle: 'OG Title',
      });

      expect(result).toContain('OG Title');
      expect(result).not.toContain('HTML Title');
    });
  });
});
