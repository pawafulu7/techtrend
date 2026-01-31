import { ClaudeBlogFetcher } from '@/lib/fetchers/ai/anthropic-blog';
import { Source } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// Mock fetch
global.fetch = jest.fn();

// Mock logger
jest.mock('@/lib/cli/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockSource: Source = {
  id: 'claude_blog_official',
  name: 'Claude Blog',
  type: 'SCRAPER',
  url: 'https://claude.com/blog',
  enabled: true,
  groupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Helper to load fixture
function loadFixture(name: string): string {
  return fs.readFileSync(
    path.join(__dirname, '../../../fixtures/anthropic-blog', `${name}.html`),
    'utf-8'
  );
}

// Helper to mock successful fetch
function mockFetchSuccess(html: string): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(html),
  });
}

// Helper to mock fetch failure
function mockFetchFailure(status: number): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(''),
  });
}

describe('ClaudeBlogFetcher', () => {
  let fetcher: ClaudeBlogFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-20T00:00:00Z'));
    fetcher = new ClaudeBlogFetcher(mockSource);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should be instantiated with source', () => {
      expect(fetcher).toBeDefined();
      expect(fetcher).toBeInstanceOf(ClaudeBlogFetcher);
    });
  });

  describe('fetch()', () => {
    describe('successful scenarios', () => {
      it('should return articles array on successful fetch', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();

        expect(result.articles).toBeDefined();
        expect(result.articles.length).toBeGreaterThan(0);
        expect(result.errors).toEqual([]);
      });

      it('should parse all article fields correctly', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();
        const article = result.articles[0];

        expect(article.title).toBe('Test Article One');
        expect(article.url).toBe('https://claude.com/blog/test-article-one');
        expect(article.sourceId).toBe('claude_blog_official');
        expect(article.tagNames).toEqual(['Claude', 'Anthropic', 'AI', 'LLM']);
      });

      it('should extract thumbnail when available', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBe(
          'https://claude.com/images/article1.jpg'
        );
        expect(result.articles[1].thumbnail).toBe(
          'https://images.ctfassets.net/article2.jpg'
        );
      });

      it('should handle articles without thumbnail', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();

        // Third article has no thumbnail
        expect(result.articles[2].thumbnail).toBeUndefined();
      });

      it('should limit articles to maxArticles', async () => {
        // Create HTML with many articles
        const manyArticles = Array(30)
          .fill(0)
          .map(
            (_, i) => `
          <div class="blog_cms_item">
            <a href="/blog/article-${i}">
              <div class="card_blog_title">Article ${i}</div>
            </a>
            <div>January ${(i % 28) + 1}, 2026</div>
          </div>
        `
          )
          .join('');

        mockFetchSuccess(`<html><body>${manyArticles}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBeLessThanOrEqual(20);
      });
    });

    describe('date filtering', () => {
      it('should filter out articles older than 30 days', async () => {
        const oldArticleHtml = `
          <div class="blog_cms_item">
            <a href="/blog/old-article">
              <div class="card_blog_title">Old Article</div>
            </a>
            <div>November 1, 2025</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${oldArticleHtml}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should filter out future dated articles', async () => {
        const futureArticleHtml = `
          <div class="blog_cms_item">
            <a href="/blog/future-article">
              <div class="card_blog_title">Future Article</div>
            </a>
            <div>March 1, 2026</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${futureArticleHtml}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });
    });

    describe('HTML parsing', () => {
      it('should use primary selector (.blog_cms_item)', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(3);
      });

      it('should fallback to secondary selector (.card_blog_wrap)', async () => {
        mockFetchSuccess(loadFixture('fallback-selector'));

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
        expect(result.articles[0].title).toBe('Fallback Selector Article');
      });

      it('should return empty array when no selectors match', async () => {
        mockFetchSuccess(loadFixture('empty-articles'));

        const result = await fetcher.fetch();

        expect(result.articles).toEqual([]);
        expect(result.errors).toEqual([]);
      });

      it('should handle malformed HTML gracefully', async () => {
        mockFetchSuccess(loadFixture('malformed'));

        const result = await fetcher.fetch();

        // Only complete article should be parsed
        expect(result.articles.length).toBe(1);
        expect(result.articles[0].title).toBe('Complete Article');
      });

      it('should skip articles with missing required fields', async () => {
        const incompleteHtml = `
          <div class="blog_cms_item">
            <a href="/blog/no-title"></a>
          </div>
          <div class="blog_cms_item">
            <div class="card_blog_title">No Link Article</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${incompleteHtml}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });
    });

    describe('date parsing', () => {
      it('should parse "January 12, 2026" format', async () => {
        const html = `
          <div class="blog_cms_item">
            <a href="/blog/test"><div class="card_blog_title">Test</div></a>
            <div>January 12, 2026</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${html}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles[0].publishedAt).toEqual(new Date('2026-01-12'));
      });

      it('should parse abbreviated month format "Jan 12, 2026"', async () => {
        const html = `
          <div class="blog_cms_item">
            <a href="/blog/test"><div class="card_blog_title">Test</div></a>
            <div>Jan 12, 2026</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${html}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles[0].publishedAt).toEqual(new Date('2026-01-12'));
      });

      it('should use current date for unparseable dates', async () => {
        const html = `
          <div class="blog_cms_item">
            <a href="/blog/test"><div class="card_blog_title">Test</div></a>
            <div>Invalid Date Format</div>
          </div>
        `;

        mockFetchSuccess(`<html><body>${html}</body></html>`);

        const result = await fetcher.fetch();

        expect(result.articles[0].publishedAt).toEqual(new Date('2026-01-20'));
      });
    });

    describe('error handling', () => {
      it('should return errors array on fetch failure', async () => {
        // Mock all retries to fail
        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));

        // Advance timers for retry delays
        const fetchPromise = fetcher.fetch();

        // Advance time for each retry delay (500ms * 1, 500ms * 2, 500ms * 3)
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1500);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Network error');
      });

      it('should handle HTTP error status', async () => {
        // Mock all retries to fail with HTTP error
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 });

        const fetchPromise = fetcher.fetch();

        // Advance time for each retry delay
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1500);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
      });
    });
  });

  describe('URL validation', () => {
    describe('validateArticleUrl', () => {
      it('should accept valid relative URLs', () => {
        expect(fetcher.validateArticleUrl('/blog/test-article')).toBe(
          'https://claude.com/blog/test-article'
        );
      });

      it('should accept valid absolute URLs', () => {
        expect(fetcher.validateArticleUrl('https://claude.com/blog/test')).toBe(
          'https://claude.com/blog/test'
        );
      });

      it('should reject javascript: URLs', () => {
        expect(
          fetcher.validateArticleUrl('javascript:alert(1)')
        ).toBeUndefined();
        expect(
          fetcher.validateArticleUrl('JAVASCRIPT:alert(1)')
        ).toBeUndefined();
      });

      it('should reject data: URLs', () => {
        expect(
          fetcher.validateArticleUrl('data:text/html,<script>')
        ).toBeUndefined();
      });

      it('should reject vbscript: URLs', () => {
        expect(
          fetcher.validateArticleUrl('vbscript:msgbox(1)')
        ).toBeUndefined();
      });

      it('should reject blob: URLs', () => {
        expect(
          fetcher.validateArticleUrl('blob:https://evil.com/id')
        ).toBeUndefined();
      });

      it('should reject file: URLs', () => {
        expect(
          fetcher.validateArticleUrl('file:///etc/passwd')
        ).toBeUndefined();
      });

      it('should reject http: URLs (non-HTTPS)', () => {
        expect(
          fetcher.validateArticleUrl('http://claude.com/blog/test')
        ).toBeUndefined();
      });

      it('should reject URLs with userinfo', () => {
        expect(
          fetcher.validateArticleUrl('https://user:pass@claude.com/blog')
        ).toBeUndefined();
      });

      it('should reject URLs from non-whitelisted hosts', () => {
        expect(
          fetcher.validateArticleUrl('https://malicious-site.com/attack')
        ).toBeUndefined();
        expect(
          fetcher.validateArticleUrl('https://evil-claude.com/attack')
        ).toBeUndefined();
      });

      it('should reject URLs exceeding max length', () => {
        const longUrl = '/blog/' + 'a'.repeat(3000);
        expect(fetcher.validateArticleUrl(longUrl)).toBeUndefined();
      });

      it('should handle empty or undefined URLs', () => {
        expect(fetcher.validateArticleUrl('')).toBeUndefined();
      });
    });

    describe('validateThumbnailUrl', () => {
      it('should accept valid thumbnail URLs from allowed hosts', () => {
        expect(
          fetcher.validateThumbnailUrl('https://claude.com/image.jpg')
        ).toBe('https://claude.com/image.jpg');

        expect(
          fetcher.validateThumbnailUrl('https://images.ctfassets.net/image.jpg')
        ).toBe('https://images.ctfassets.net/image.jpg');
      });

      it('should handle protocol-relative URLs', () => {
        expect(fetcher.validateThumbnailUrl('//claude.com/image.jpg')).toBe(
          'https://claude.com/image.jpg'
        );
      });

      it('should reject thumbnails from non-whitelisted hosts', () => {
        expect(
          fetcher.validateThumbnailUrl('https://malicious.com/image.jpg')
        ).toBeUndefined();
      });

      it('should reject javascript: thumbnail URLs', () => {
        expect(
          fetcher.validateThumbnailUrl('javascript:alert(1)')
        ).toBeUndefined();
      });

      it('should reject data: thumbnail URLs', () => {
        expect(
          fetcher.validateThumbnailUrl('data:image/png;base64,abc')
        ).toBeUndefined();
      });

      it('should handle undefined thumbnail', () => {
        expect(fetcher.validateThumbnailUrl(undefined)).toBeUndefined();
      });

      it('should reject thumbnails with userinfo', () => {
        expect(
          fetcher.validateThumbnailUrl('https://user:pass@claude.com/img.jpg')
        ).toBeUndefined();
      });
    });
  });
});
