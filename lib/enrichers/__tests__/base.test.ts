import { BaseContentEnricher } from '../base';

// NOTE: fetchの「グローバルモック」は行わない。必要なテスト（例: リトライ）ではケース単位で局所的にstubする。

// Test implementation of BaseContentEnricher
class TestContentEnricher extends BaseContentEnricher {
  private mockHtml: string = '';
  private shouldFail: boolean = false;
  private failCount: number = 0;
  private maxFailCount: number = 0;

  canHandle(url: string): boolean {
    // Properly validate URL to prevent security issues
    try {
      const parsedUrl = new URL(url);
      // Check if the hostname is exactly test.com or a subdomain of test.com
      return parsedUrl.hostname === 'test.com' || 
             parsedUrl.hostname.endsWith('.test.com');
    } catch {
      // Invalid URL
      return false;
    }
  }

  setMockHtml(html: string) {
    this.mockHtml = html;
  }

  setShouldFail(shouldFail: boolean, maxFailCount: number = 0) {
    this.shouldFail = shouldFail;
    this.maxFailCount = maxFailCount;
    this.failCount = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async fetchWithRetry(_url: string): Promise<string> {
    if (this.shouldFail) {
      if (this.maxFailCount > 0 && this.failCount < this.maxFailCount) {
        this.failCount++;
        throw new Error('Temporary failure');
      } else if (this.maxFailCount > 0) {
        // After maxFailCount failures, succeed
        this.shouldFail = false;
        return this.mockHtml;
      }
      throw new Error('Network error');
    }
    return this.mockHtml;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected delay(_ms: number): Promise<void> {
    // Mock delay - don't actually wait
    return Promise.resolve();
  }

  protected getContentSelectors(): string[] {
    return ['.test-content', 'article'];
  }
}

describe('BaseContentEnricher', () => {
  let enricher: TestContentEnricher;
  const testUrl = 'https://test.com/article';

  beforeEach(() => {
    jest.clearAllMocks();
    enricher = new TestContentEnricher();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('enrich', () => {
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
      enricher.setMockHtml(mockHtml);

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Test Article');
      expect(result?.content).toContain('test content');
      expect(result?.thumbnail).toBe('https://test.com/image.jpg');
    });

    it('should handle fetch errors gracefully', async () => {
      enricher.setShouldFail(true);

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

      enricher.setMockHtml(shortHtml);

      const result = await enricher.enrich(testUrl);

      expect(result).toBeNull();
    });

    it.skip('should retry on failure', async () => {
      // First call will fail, second will succeed
      enricher.setMockHtml(mockHtml);
      enricher.setShouldFail(true, 2); // Allow 2 failures before success

      const fetchSpy = jest.spyOn(enricher as unknown as { fetchWithRetry: (url: string) => Promise<string> }, 'fetchWithRetry');

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('should remove script and style elements from content', async () => {
      const htmlWithScripts = `
        <html>
          <body>
            <article>
              <h1>Test Article</h1>
              <p>Main content that should be kept in the final output.</p>
              <p>This is important information that we want to preserve.</p>
              <script>console.log('script');</script>
              <style>body { color: red; }</style>
              <noscript>No JavaScript</noscript>
              <iframe src="https://example.com"></iframe>
              <p>More content to ensure we have enough text for the test.</p>
            </article>
          </body>
        </html>
      `;

      enricher.setMockHtml(htmlWithScripts);

      const result = await enricher.enrich(testUrl);

      expect(result).not.toBeNull();
      // Type assertion for safety
      if (!result) {
        throw new Error('Result should not be null');
      }
      // script, style, noscript, iframe要素は削除される
      expect(result.content).not.toContain('console.log');
      expect(result.content).not.toContain('body { color: red; }');
      expect(result.content).not.toContain('No JavaScript');
      expect(result.content).not.toContain('iframe');
      // 通常のコンテンツは保持される
      expect(result.content).toContain('Main content');
      expect(result.content).toContain('Test Article');
    });
  });

  describe('canHandle', () => {
    it('should correctly identify handleable URLs', () => {
      expect(enricher.canHandle('https://test.com/article')).toBe(true);
      expect(enricher.canHandle('https://example.test.com/page')).toBe(true);
      expect(enricher.canHandle('https://other.com/article')).toBe(false);
      
      // 追加の境界ケーステスト（セキュリティ検証）
      expect(enricher.canHandle('https://evil-test.com/article')).toBe(false);
      expect(enricher.canHandle('https://test.com.evil.tld')).toBe(false);
      expect(enricher.canHandle('not a url')).toBe(false);
      expect(enricher.canHandle('http://test.com?redirect=evil.com')).toBe(true);
      expect(enricher.canHandle('https://sub.test.com/path')).toBe(true);
    });
  });

  describe('extractThumbnail', () => {
    it('should extract og:image meta tag', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
          <body>
            <article>
              <p>Content with enough text to pass validation checks for the test.</p>
              <p>We need sufficient content here to ensure the enrich method returns a result.</p>
              <p>Adding more text to make sure we have enough content for validation.</p>
            </article>
          </body>
        </html>
      `;

      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result?.thumbnail).toBe('https://example.com/image.jpg');
    });

    it('should extract twitter:image meta tag', async () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:image" content="https://example.com/twitter.jpg">
          </head>
          <body>
            <article>
              <p>Content with enough text to pass validation checks for the test.</p>
              <p>We need sufficient content here to ensure the enrich method returns a result.</p>
              <p>Adding more text to make sure we have enough content for validation.</p>
            </article>
          </body>
        </html>
      `;

      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result?.thumbnail).toBe('https://example.com/twitter.jpg');
    });

    it('should return null when no thumbnail found', async () => {
      const html = `
        <html>
          <head></head>
          <body>
            <article>
              <p>Content with enough text to pass validation checks for the test.</p>
              <p>We need sufficient content here to ensure the enrich method returns a result.</p>
              <p>Adding more text to make sure we have enough content for validation.</p>
            </article>
          </body>
        </html>
      `;
      
      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result?.thumbnail).toBeNull();
    });
  });

  describe('isContentSufficient', () => {
    it('should return result for sufficient content', async () => {
      const html = `
        <html>
          <body>
            <article>
              ${'<p>This is a test paragraph with sufficient content.</p>'.repeat(10)}
            </article>
          </body>
        </html>
      `;
      
      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result).not.toBeNull();
      expect(result?.content).toBeTruthy();
    });

    it('should return null for insufficient content', async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short</p>
            </article>
          </body>
        </html>
      `;
      
      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result).toBeNull();
    });

    it('should return null for empty content', async () => {
      const html = `
        <html>
          <body>
            <article></article>
          </body>
        </html>
      `;
      
      enricher.setMockHtml(html);
      const result = await enricher.enrich(testUrl);
      expect(result).toBeNull();
    });
  });
});