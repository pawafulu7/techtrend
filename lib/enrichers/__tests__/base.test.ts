import { BaseContentEnricher } from '../base';
import fetch from 'node-fetch';

jest.mock('node-fetch');

// Test implementation of BaseContentEnricher
class TestContentEnricher extends BaseContentEnricher {
  canHandle(url: string): boolean {
    return url.includes('test.com');
  }

  protected contentSelectors = ['.test-content', 'article'];
}

describe('BaseContentEnricher', () => {
  let enricher: TestContentEnricher;
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    enricher = new TestContentEnricher();
  });

  describe('enrich', () => {
    const testUrl = 'https://test.com/article';
    const mockHtml = `
      <html>
        <head>
          <meta property="og:image" content="https://test.com/image.jpg">
        </head>
        <body>
          <article>
            <h1>Test Article</h1>
            <p>This is test content with sufficient length to pass the content check.</p>
            <p>We need to make sure this has enough text to be considered valid content.</p>
            <p>Adding more text here to ensure we have enough content for the test.</p>
          </article>
        </body>
      </html>
    `;

    it('should successfully enrich content from URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => mockHtml,
        headers: {
          get: () => 'text/html'
        }
      } as Response);

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Test Article');
      expect(result?.content).toContain('test content');
      expect(result?.thumbnail).toBe('https://test.com/image.jpg');
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it('should return null for insufficient content', async () => {
      const shortHtml = `
        <html>
          <body>
            <article>
              <p>Short</p>
            </article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => shortHtml,
        headers: {
          get: () => 'text/html'
        }
      } as Response);

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mockHtml,
          headers: {
            get: () => 'text/html'
          }
        } as Response);

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should remove unwanted elements from content', async () => {
      const htmlWithAds = `
        <html>
          <body>
            <article>
              <h1>Test Article</h1>
              <p>Main content that should be kept in the final output.</p>
              <p>This is important information that we want to preserve.</p>
              <div class="ad">Advertisement</div>
              <aside>Sidebar content</aside>
              <script>console.log('script');</script>
              <style>body { color: red; }</style>
              <p>More content to ensure we have enough text for the test.</p>
            </article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => htmlWithAds,
        headers: {
          get: () => 'text/html'
        }
      } as Response);

      const result = await enricher.enrich(testUrl);

      expect(result?.content).not.toContain('Advertisement');
      expect(result?.content).not.toContain('Sidebar content');
      expect(result?.content).not.toContain('console.log');
      expect(result?.content).not.toContain('body { color: red; }');
      expect(result?.content).toContain('Main content');
    });
  });

  describe('canHandle', () => {
    it('should correctly identify handleable URLs', () => {
      expect(enricher.canHandle('https://test.com/article')).toBe(true);
      expect(enricher.canHandle('https://example.test.com/page')).toBe(true);
      expect(enricher.canHandle('https://other.com/article')).toBe(false);
    });
  });

  describe('extractThumbnail', () => {
    it('should extract og:image meta tag', () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
        </html>
      `;

      const thumbnail = (enricher as TestContentEnricher & {extractThumbnail: (html: string) => string | null}).extractThumbnail(html);
      expect(thumbnail).toBe('https://example.com/image.jpg');
    });

    it('should extract twitter:image meta tag', () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:image" content="https://example.com/twitter.jpg">
          </head>
        </html>
      `;

      const thumbnail = (enricher as TestContentEnricher & {extractThumbnail: (html: string) => string | null}).extractThumbnail(html);
      expect(thumbnail).toBe('https://example.com/twitter.jpg');
    });

    it('should return null when no thumbnail found', () => {
      const html = '<html><head></head></html>';
      
      const thumbnail = (enricher as TestContentEnricher & {extractThumbnail: (html: string) => string | null}).extractThumbnail(html);
      expect(thumbnail).toBeNull();
    });
  });

  describe('isContentSufficient', () => {
    it('should return true for sufficient content', () => {
      const content = 'a'.repeat(1000);
      expect((enricher as TestContentEnricher & {isContentSufficient: (content: string | null, minLength: number) => boolean}).isContentSufficient(content, 500)).toBe(true);
    });

    it('should return false for insufficient content', () => {
      const content = 'short';
      expect((enricher as TestContentEnricher & {isContentSufficient: (content: string | null, minLength: number) => boolean}).isContentSufficient(content, 500)).toBe(false);
    });

    it('should return false for null content', () => {
      expect((enricher as TestContentEnricher & {isContentSufficient: (content: string | null, minLength: number) => boolean}).isContentSufficient(null, 500)).toBe(false);
    });
  });
});