import { AnthropicNewsFetcher } from '@/lib/fetchers/ai/anthropic-news';
import { Source } from '@/lib/prisma-exports';
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
  id: 'anthropic_news',
  name: 'Anthropic News',
  type: 'SCRAPER',
  url: 'https://www.anthropic.com/news',
  enabled: true,
  groupId: 'group_company_global',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function loadFixture(name: string): string {
  return fs.readFileSync(
    path.join(__dirname, '../../../fixtures/anthropic-news', `${name}.html`),
    'utf-8'
  );
}

function mockFetchSuccess(html: string): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(html),
  });
}

describe('AnthropicNewsFetcher', () => {
  let fetcher: AnthropicNewsFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    fetcher = new AnthropicNewsFetcher(mockSource);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should be instantiated with source', () => {
      expect(fetcher).toBeDefined();
      expect(fetcher).toBeInstanceOf(AnthropicNewsFetcher);
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

      it('should parse article fields correctly', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();
        const article = result.articles[0];

        expect(article.title).toBe('Test Article One');
        expect(article.url).toBe(
          'https://www.anthropic.com/news/test-article-one'
        );
        expect(article.sourceId).toBe('anthropic_news');
        expect(article.tagNames).toContain('Anthropic');
        expect(article.tagNames).toContain('AI');
      });

      it('should include category as tag when available', async () => {
        mockFetchSuccess(loadFixture('valid-response'));

        const result = await fetcher.fetch();
        const article = result.articles[0];

        expect(article.tagNames).toContain('Announcements');
      });

      it('should handle special paths like /mars', async () => {
        mockFetchSuccess(loadFixture('special-paths'));

        const result = await fetcher.fetch();

        const marsArticle = result.articles.find(
          (a) => a.url === 'https://www.anthropic.com/mars'
        );
        expect(marsArticle).toBeDefined();
        expect(marsArticle!.title).toBe('Claude on Mars');
      });
    });

    describe('date filtering', () => {
      it('should filter out articles older than 30 days', async () => {
        const oldArticleHtml = `
          <html><body><main>
            <a href="/news/old-article">
              <h3>Old Article</h3>
              <span>November 1, 2025</span>
            </a>
          </main></body></html>
        `;

        mockFetchSuccess(oldArticleHtml);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should filter out future dated articles', async () => {
        const futureArticleHtml = `
          <html><body><main>
            <a href="/news/future-article">
              <h3>Future Article</h3>
              <span>April 1, 2026</span>
            </a>
          </main></body></html>
        `;

        mockFetchSuccess(futureArticleHtml);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });
    });

    describe('empty results', () => {
      it('should return empty array when no articles found', async () => {
        mockFetchSuccess(loadFixture('empty-articles'));

        const result = await fetcher.fetch();

        expect(result.articles).toEqual([]);
        expect(result.errors).toEqual([]);
      });
    });

    describe('error handling', () => {
      it('should return errors array on fetch failure', async () => {
        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));

        const fetchPromise = fetcher.fetch();

        // Exponential backoff: 500ms * 2^0, 500ms * 2^1, 500ms * 2^2
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(2000);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Network error');
      });

      it('should handle HTTP error status', async () => {
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 });

        const fetchPromise = fetcher.fetch();

        // Exponential backoff: 500ms * 2^0, 500ms * 2^1, 500ms * 2^2
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(2000);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
      });
    });
  });

  describe('URL validation', () => {
    describe('validateArticleUrl', () => {
      it('should accept valid relative URLs', () => {
        expect(fetcher.validateArticleUrl('/news/test-article')).toBe(
          'https://www.anthropic.com/news/test-article'
        );
      });

      it('should accept valid absolute URLs', () => {
        expect(
          fetcher.validateArticleUrl('https://www.anthropic.com/news/test')
        ).toBe('https://www.anthropic.com/news/test');
      });

      it('should accept anthropic.com without www', () => {
        expect(
          fetcher.validateArticleUrl('https://anthropic.com/news/test')
        ).toBe('https://anthropic.com/news/test');
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
          fetcher.validateArticleUrl('http://anthropic.com/news/test')
        ).toBeUndefined();
      });

      it('should reject URLs with userinfo', () => {
        expect(
          fetcher.validateArticleUrl(
            'https://user:pass@anthropic.com/news/test'
          )
        ).toBeUndefined();
      });

      it('should reject URLs from non-whitelisted hosts', () => {
        expect(
          fetcher.validateArticleUrl('https://malicious-site.com/attack')
        ).toBeUndefined();
      });

      it('should reject URLs exceeding max length', () => {
        const longUrl = '/news/' + 'a'.repeat(3000);
        expect(fetcher.validateArticleUrl(longUrl)).toBeUndefined();
      });

      it('should handle empty URLs', () => {
        expect(fetcher.validateArticleUrl('')).toBeUndefined();
      });
    });

    describe('validateThumbnailUrl', () => {
      it('should accept valid thumbnail URLs from allowed hosts', () => {
        expect(
          fetcher.validateThumbnailUrl('https://www.anthropic.com/image.jpg')
        ).toBe('https://www.anthropic.com/image.jpg');

        expect(
          fetcher.validateThumbnailUrl('https://cdn.sanity.io/image.jpg')
        ).toBe('https://cdn.sanity.io/image.jpg');
      });

      it('should handle protocol-relative URLs', () => {
        expect(
          fetcher.validateThumbnailUrl('//www.anthropic.com/image.jpg')
        ).toBe('https://www.anthropic.com/image.jpg');
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

      it('should reject http: thumbnail URLs', () => {
        expect(
          fetcher.validateThumbnailUrl('http://www.anthropic.com/image.jpg')
        ).toBeUndefined();
      });

      it('should handle undefined thumbnail', () => {
        expect(fetcher.validateThumbnailUrl(undefined)).toBeUndefined();
      });

      it('should reject thumbnails with userinfo', () => {
        expect(
          fetcher.validateThumbnailUrl(
            'https://user:pass@anthropic.com/img.jpg'
          )
        ).toBeUndefined();
      });
    });
  });
});
