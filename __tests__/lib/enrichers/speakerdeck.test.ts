/**
 * Tests for SpeakerDeckEnricher
 */

import { SpeakerDeckEnricher } from '@/lib/enrichers/speakerdeck';

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

describe('SpeakerDeckEnricher', () => {
  let enricher: SpeakerDeckEnricher;

  beforeEach(() => {
    enricher = new SpeakerDeckEnricher();
    mockFetch.mockReset();
  });

  describe('canHandle', () => {
    it('should handle speakerdeck.com URLs', () => {
      expect(enricher.canHandle('https://speakerdeck.com/user/presentation')).toBe(true);
      expect(enricher.canHandle('https://speakerdeck.com/oikon48/claude-code')).toBe(true);
    });

    it('should not handle non-speakerdeck URLs', () => {
      expect(enricher.canHandle('https://slideshare.net/presentation')).toBe(false);
      expect(enricher.canHandle('https://docs.google.com/presentation')).toBe(false);
      expect(enricher.canHandle('https://example.com/speakerdeck')).toBe(false);
    });
  });

  describe('enrich', () => {
    const testUrl = 'https://speakerdeck.com/testuser/test-presentation';

    it('should extract content from oEmbed response', async () => {
      const oEmbedResponse = {
        type: 'rich',
        version: '1.0',
        title: 'Test Presentation Title',
        author_name: 'Test Author',
        author_url: 'https://speakerdeck.com/testuser',
        provider_name: 'Speaker Deck',
        provider_url: 'https://speakerdeck.com',
        thumbnail_url: 'https://speakerdeck.com/thumbnail.jpg',
        html: '<iframe></iframe>',
        width: 710,
        height: 400,
        ratio: 1.775,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => oEmbedResponse,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Test Presentation Title');
      expect(result?.content).toContain('Speaker: Test Author');
      expect(result?.content).toContain('Speaker Deck');
      expect(result?.thumbnail).toBe('https://speakerdeck.com/thumbnail.jpg');
    });

    it('should fall back to HTML when oEmbed fails', async () => {
      // oEmbed request fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // HTML fallback succeeds
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Fallback Presentation - Speaker Deck</title>
          <meta property="og:title" content="Fallback Presentation">
          <meta property="og:description" content="This is a test description for the presentation that is longer than minimum.">
          <meta property="og:image" content="https://speakerdeck.com/fallback-thumb.jpg">
        </head>
        <body>
          <article>
            <div class="deck-author"><a href="/author">Fallback Author</a></div>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlResponse,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Fallback Presentation');
      expect(result?.thumbnail).toBe('https://speakerdeck.com/fallback-thumb.jpg');
    });

    it('should return minimal content when both strategies have limited data', async () => {
      // oEmbed fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      // HTML has minimal content (just platform and URL added by enricher)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><head><title>Empty</title></head><body></body></html>',
      });

      const result = await enricher.enrich(testUrl);

      // Enricher returns platform/URL info even with minimal HTML
      // This is expected behavior - it always adds platform and URL
      expect(result?.content).toContain('Platform: Speaker Deck');
      expect(result?.content).toContain('URL:');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it('should include slide count when available in embed HTML', async () => {
      const oEmbedResponse = {
        type: 'rich',
        version: '1.0',
        title: 'Slides with Count',
        author_name: 'Author',
        provider_name: 'Speaker Deck',
        html: '<iframe data-slide-count="42"></iframe>',
        width: 710,
        height: 400,
        ratio: 1.775,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => oEmbedResponse,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Slides: 42');
    });

    it('should fetch thumbnail from HTML when oEmbed has no thumbnail_url', async () => {
      // oEmbed succeeds but without thumbnail_url
      const oEmbedResponse = {
        type: 'rich',
        version: '1.0',
        title: 'Presentation Without Thumbnail',
        author_name: 'Author',
        provider_name: 'Speaker Deck',
        html: '<iframe></iframe>',
        width: 710,
        height: 400,
        // thumbnail_url is intentionally missing
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => oEmbedResponse,
      });

      // HTML fetch for thumbnail
      const htmlResponse = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta property="og:image" content="https://files.speakerdeck.com/presentations/abc/slide_0.jpg">
        </head>
        <body></body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => htmlResponse,
      });

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Presentation Without Thumbnail');
      expect(result?.thumbnail).toBe('https://files.speakerdeck.com/presentations/abc/slide_0.jpg');
    });

    it('should return null thumbnail when HTML fetch fails after oEmbed success', async () => {
      // oEmbed succeeds but without thumbnail_url
      const oEmbedResponse = {
        type: 'rich',
        version: '1.0',
        title: 'Presentation Without Thumbnail',
        author_name: 'Author',
        provider_name: 'Speaker Deck',
        html: '<iframe></iframe>',
        width: 710,
        height: 400,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => oEmbedResponse,
      });

      // HTML fetch fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Presentation Without Thumbnail');
      expect(result?.thumbnail).toBeNull();
    });
  });
});
