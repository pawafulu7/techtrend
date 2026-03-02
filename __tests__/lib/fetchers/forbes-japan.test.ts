import { ForbesJapanFetcher } from '@/lib/fetchers/forbes-japan';
import { createFetcher } from '@/lib/fetchers';
import { Source } from '@prisma/client';
import { logger } from '@/lib/cli/utils/logger';

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
  id: 'forbes_japan_ai',
  name: 'Forbes Japan AI',
  type: 'SCRAPER',
  url: 'https://forbesjapan.com/category/technology_ai',
  enabled: true,
  groupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

/**
 * Build a Forbes Japan-style HTML page from article descriptors.
 * Each article is wrapped in a <li> with the expected link selector
 * a[href^="/articles/detail/"].
 */
function buildHtml(
  articles: Array<{
    id: number;
    title: string;
    date?: string;
    thumbnail?: string;
    /** If true, wraps an <img> instead of text inside the link */
    imgOnly?: boolean;
    /** If set, puts the title in a heading INSIDE the link */
    headingTitle?: boolean;
    /** If true, uses Forbes Japan's real p.tit structure inside the link */
    forbesStyle?: boolean;
  }>
): string {
  const items = articles
    .map((a) => {
      const imgTag = a.thumbnail
        ? `<img src="${a.thumbnail}" alt="${a.imgOnly ? a.title : ''}" />`
        : '';

      if (a.forbesStyle) {
        // Forbes Japan's actual HTML structure: p.tit inside <a>
        return `
      <li>
        <a href="/articles/detail/${a.id}">
          <div class="meta"><p class="cate">カテゴリ</p>${a.date ? `<p class="date">${a.date}</p>` : ''}</div>
          <p class="tit">${a.title}</p>
          ${a.thumbnail ? `<img src="${a.thumbnail}" />` : ''}
        </a>
      </li>`;
      }

      let linkContent: string;
      if (a.imgOnly) {
        // Link wraps only an image (title comes from alt)
        linkContent = imgTag;
      } else if (a.headingTitle) {
        // Heading inside the link (extractTitle searches inside $link)
        linkContent = `<h3 class="article-title">${a.title}</h3>`;
      } else {
        linkContent = a.title;
      }

      return `
      <li>
        <a href="/articles/detail/${a.id}">
          ${linkContent}
        </a>
        ${!a.imgOnly && !a.headingTitle && a.thumbnail ? imgTag : ''}
        ${a.date ? `<span class="date">${a.date}</span>` : ''}
      </li>`;
    })
    .join('\n');

  return `<html><body><ul>${items}</ul></body></html>`;
}

describe('ForbesJapanFetcher', () => {
  let fetcher: ForbesJapanFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Set system time to 2026-03-02 00:00:00 UTC
    jest.setSystemTime(new Date('2026-03-02T00:00:00Z'));
    fetcher = new ForbesJapanFetcher(mockSource);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ------------------------------------------------------------------
  // 1. Constructor
  // ------------------------------------------------------------------
  describe('constructor', () => {
    it('should be instantiated with source', () => {
      expect(fetcher).toBeDefined();
      expect(fetcher).toBeInstanceOf(ForbesJapanFetcher);
    });
  });

  // ------------------------------------------------------------------
  // 2. fetch() - HTML parsing & article extraction
  // ------------------------------------------------------------------
  describe('fetch()', () => {
    describe('successful scenarios', () => {
      it('should extract articles from mock HTML using URL pattern selector', async () => {
        const html = buildHtml([
          {
            id: 12345,
            title: 'AI Article Title One',
            date: '2026.3.1 10:30',
            forbesStyle: true,
          },
          {
            id: 67890,
            title: 'AI Article Title Two',
            date: '2026.2.28 08:00',
            forbesStyle: true,
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(2);
        expect(result.errors).toEqual([]);
      });

      it('should parse all article fields correctly', async () => {
        const html = buildHtml([
          {
            id: 99999,
            title: 'Forbes Japan Test Article',
            date: '2026.3.1 10:30',
            thumbnail: 'https://forbesjapan.com/media/photo1.jpg',
            forbesStyle: true,
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();
        const article = result.articles[0];

        expect(article.title).toBe('Forbes Japan Test Article');
        expect(article.url).toBe(
          'https://forbesjapan.com/articles/detail/99999'
        );
        expect(article.sourceId).toBe('forbes_japan_ai');
        expect(article.tagNames).toEqual(['Forbes Japan', 'AI']);
        expect(article.thumbnail).toBe(
          'https://forbesjapan.com/media/photo1.jpg'
        );
      });

      it('should limit articles to maxArticles (20)', async () => {
        const articles = Array(25)
          .fill(0)
          .map((_, i) => ({
            id: 1000 + i,
            title: `Article number ${i + 1} with enough text`,
            date: `2026.2.${(i % 28) + 1} 09:00`,
          }));
        mockFetchSuccess(buildHtml(articles));

        const result = await fetcher.fetch();

        expect(result.articles.length).toBeLessThanOrEqual(20);
      });
    });

    // ------------------------------------------------------------------
    // 3. Duplicate URL deduplication
    // ------------------------------------------------------------------
    describe('duplicate URL handling', () => {
      it('should deduplicate articles with the same URL', async () => {
        // Two links pointing to the same article detail page
        const html = `<html><body>
          <li>
            <a href="/articles/detail/11111">First occurrence of article</a>
            <span>2026.3.1 10:00</span>
          </li>
          <li>
            <a href="/articles/detail/11111">Second occurrence of article</a>
            <span>2026.3.1 10:00</span>
          </li>
        </body></html>`;
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
      });
    });

    // ------------------------------------------------------------------
    // 4. Title extraction fallbacks
    // ------------------------------------------------------------------
    describe('title extraction', () => {
      it('should extract title from p.tit element (Forbes Japan primary pattern)', async () => {
        const html = buildHtml([
          {
            id: 10,
            title: 'Forbes Japan p.tit Title',
            date: '2026.3.1 10:00',
            forbesStyle: true,
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].title).toBe('Forbes Japan p.tit Title');
      });

      it('should extract title from direct link text', async () => {
        const html = buildHtml([
          {
            id: 1,
            title: 'Direct Link Text Title Here',
            date: '2026.3.1 10:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].title).toBe('Direct Link Text Title Here');
      });

      it('should fall back to heading in parent when link text is short', async () => {
        const html = buildHtml([
          {
            id: 2,
            title: 'Heading Title for the Article',
            date: '2026.3.1 10:00',
            headingTitle: true,
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].title).toBe('Heading Title for the Article');
      });

      it('should fall back to img alt attribute when link has only an image', async () => {
        const html = buildHtml([
          {
            id: 3,
            title: 'Image Alt Text Title Here',
            date: '2026.3.1 10:00',
            thumbnail: 'https://forbesjapan.com/media/img3.jpg',
            imgOnly: true,
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].title).toBe('Image Alt Text Title Here');
      });
    });

    // ------------------------------------------------------------------
    // 5. Thumbnail extraction
    // ------------------------------------------------------------------
    describe('thumbnail extraction', () => {
      it('should extract thumbnail from img in the link', async () => {
        const html = `<html><body>
          <li>
            <a href="/articles/detail/100">
              <img src="https://forbesjapan.com/media/thumb.jpg" alt="Article thumbnail alt text" />
            </a>
            <span>2026.3.1 10:00</span>
          </li>
        </body></html>`;
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBe(
          'https://forbesjapan.com/media/thumb.jpg'
        );
      });

      it('should extract thumbnail from parent container img', async () => {
        const html = buildHtml([
          {
            id: 200,
            title: 'Article with sibling thumbnail',
            date: '2026.3.1 10:00',
            thumbnail: 'https://forbesjapan.com/media/sibling.jpg',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBe(
          'https://forbesjapan.com/media/sibling.jpg'
        );
      });

      it('should return undefined thumbnail when no img exists', async () => {
        const html = buildHtml([
          {
            id: 300,
            title: 'Article without any thumbnail',
            date: '2026.3.1 10:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBeUndefined();
      });
    });

    // ------------------------------------------------------------------
    // 6. Date filtering: 30-day filter + future date rejection
    // ------------------------------------------------------------------
    describe('date filtering', () => {
      it('should filter out articles older than 30 days', async () => {
        // System time is 2026-03-02. 30 days ago = 2026-01-31
        // An article from 2026.1.15 should be excluded
        const html = buildHtml([
          {
            id: 400,
            title: 'Very old Forbes article here',
            date: '2026.1.15 09:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should filter out future dated articles', async () => {
        // System time is 2026-03-02T00:00:00Z
        // A date of 2026.4.1 10:00 JST = 2026-04-01T01:00:00Z which is in the future
        const html = buildHtml([
          {
            id: 500,
            title: 'Future Forbes article title here',
            date: '2026.4.1 10:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should return articles sorted by date descending (newest first)', async () => {
        const html = buildHtml([
          {
            id: 701,
            title: 'Older article published first',
            date: '2026.2.20 10:00',
          },
          {
            id: 702,
            title: 'Newer article published second',
            date: '2026.3.1 10:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(2);
        expect(result.articles[0].title).toBe('Newer article published second');
        expect(result.articles[1].title).toBe('Older article published first');
      });

      it('should keep articles within the 30-day window', async () => {
        // 2026.2.20 10:00 JST = 2026-02-20T01:00:00Z, within 30 days of Mar 2
        const html = buildHtml([
          {
            id: 600,
            title: 'Recent Forbes article text here',
            date: '2026.2.20 10:00',
          },
        ]);
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
      });
    });

    // ------------------------------------------------------------------
    // 7. Empty results & warning
    // ------------------------------------------------------------------
    describe('empty results handling', () => {
      it('should return empty articles and warn when no articles found', async () => {
        const html = '<html><body><p>No articles here</p></body></html>';
        mockFetchSuccess(html);

        const result = await fetcher.fetch();

        expect(result.articles).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('No articles found')
        );
      });
    });

    // ------------------------------------------------------------------
    // 8. Error handling
    // ------------------------------------------------------------------
    describe('error handling', () => {
      it('should return errors array on fetch failure after retries', async () => {
        // Mock all retries (3 retries + initial = 4 calls)
        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));

        const fetchPromise = fetcher.fetch();

        // Advance time for retry delays (500ms * 1, 500ms * 2, 500ms * 3)
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1500);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Network error');
      });

      it('should return errors on HTTP error status after retries', async () => {
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: false, status: 500 });

        const fetchPromise = fetcher.fetch();

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1500);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
      });
    });
  });

  // ------------------------------------------------------------------
  // 9. parseArticleDate() - direct public method tests
  // ------------------------------------------------------------------
  describe('parseArticleDate()', () => {
    // Helper: compute expected UTC date using Date.UTC (TZ-independent)
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
    function expectedUtc(dateText: string): string {
      const match = dateText.match(
        /^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/
      );
      if (!match) throw new Error('Bad test date');
      const [, year, month, day, hour, minute] = match;
      const jstTimestamp = Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        0,
        0
      );
      return new Date(jstTimestamp - JST_OFFSET_MS).toISOString();
    }

    it('should parse "yyyy.M.d HH:mm" format with JST offset', () => {
      const result = fetcher.parseArticleDate('2026.3.2 10:30');

      expect(result).toBeDefined();
      expect(result!.toISOString()).toBe(expectedUtc('2026.3.2 10:30'));
    });

    it('should parse date with single-digit month and day', () => {
      const result = fetcher.parseArticleDate('2026.1.5 08:00');

      expect(result).toBeDefined();
      expect(result!.toISOString()).toBe(expectedUtc('2026.1.5 08:00'));
    });

    it('should parse date with double-digit month and day', () => {
      const result = fetcher.parseArticleDate('2026.12.25 18:00');

      expect(result).toBeDefined();
      expect(result!.toISOString()).toBe(expectedUtc('2026.12.25 18:00'));
    });

    it('should return undefined for empty string', () => {
      const result = fetcher.parseArticleDate('');

      expect(result).toBeUndefined();
    });

    it('should return undefined for unparseable date format', () => {
      const result = fetcher.parseArticleDate('March 2, 2026');

      expect(result).toBeUndefined();
    });

    it('should return undefined for completely invalid text', () => {
      const result = fetcher.parseArticleDate('not-a-date');

      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid month (13)', () => {
      expect(fetcher.parseArticleDate('2026.13.1 10:00')).toBeUndefined();
    });

    it('should return undefined for invalid day (32)', () => {
      expect(fetcher.parseArticleDate('2026.1.32 10:00')).toBeUndefined();
    });

    it('should return undefined for invalid hour (25)', () => {
      expect(fetcher.parseArticleDate('2026.1.1 25:00')).toBeUndefined();
    });

    it('should return undefined for invalid minute (60)', () => {
      expect(fetcher.parseArticleDate('2026.1.1 10:60')).toBeUndefined();
    });

    it('should handle midnight correctly', () => {
      const result = fetcher.parseArticleDate('2026.3.1 00:00');

      expect(result).toBeDefined();
      expect(result!.toISOString()).toBe(expectedUtc('2026.3.1 00:00'));
    });

    it('should subtract exactly 9 hours (JST offset) from parsed time', () => {
      const dateText = '2026.3.2 10:30';
      // 2026.3.2 10:30 JST = Date.UTC(2026, 2, 2, 10, 30) - 9h
      const jstTimestamp = Date.UTC(2026, 2, 2, 10, 30, 0, 0);
      const result = fetcher.parseArticleDate(dateText);

      expect(result).toBeDefined();
      expect(result!.getTime()).toBe(jstTimestamp - JST_OFFSET_MS);
    });
  });

  // ------------------------------------------------------------------
  // 10. validateArticleUrl() - URL validation
  // ------------------------------------------------------------------
  describe('validateArticleUrl()', () => {
    it('should accept valid relative article URLs', () => {
      expect(fetcher.validateArticleUrl('/articles/detail/12345')).toBe(
        'https://forbesjapan.com/articles/detail/12345'
      );
    });

    it('should accept valid absolute URLs from allowed host', () => {
      expect(
        fetcher.validateArticleUrl(
          'https://forbesjapan.com/articles/detail/12345'
        )
      ).toBe('https://forbesjapan.com/articles/detail/12345');
    });

    it('should reject javascript: URLs (case-insensitive)', () => {
      expect(fetcher.validateArticleUrl('javascript:alert(1)')).toBeUndefined();
      expect(fetcher.validateArticleUrl('JAVASCRIPT:alert(1)')).toBeUndefined();
    });

    it('should reject data: URLs', () => {
      expect(
        fetcher.validateArticleUrl('data:text/html,<script>')
      ).toBeUndefined();
    });

    it('should reject vbscript: URLs', () => {
      expect(fetcher.validateArticleUrl('vbscript:msgbox(1)')).toBeUndefined();
    });

    it('should reject blob: URLs', () => {
      expect(
        fetcher.validateArticleUrl('blob:https://evil.com/id')
      ).toBeUndefined();
    });

    it('should reject file: URLs', () => {
      expect(fetcher.validateArticleUrl('file:///etc/passwd')).toBeUndefined();
    });

    it('should reject http: URLs (non-HTTPS)', () => {
      expect(
        fetcher.validateArticleUrl('http://forbesjapan.com/articles/detail/1')
      ).toBeUndefined();
    });

    it('should reject URLs with userinfo', () => {
      expect(
        fetcher.validateArticleUrl(
          'https://user:pass@forbesjapan.com/articles/detail/1'
        )
      ).toBeUndefined();
    });

    it('should reject URLs from non-whitelisted hosts', () => {
      expect(
        fetcher.validateArticleUrl('https://malicious-site.com/attack')
      ).toBeUndefined();
      expect(
        fetcher.validateArticleUrl('https://evil-forbesjapan.com/articles')
      ).toBeUndefined();
    });

    it('should accept valid absolute URLs from www subdomain', () => {
      expect(
        fetcher.validateArticleUrl(
          'https://www.forbesjapan.com/articles/detail/12345'
        )
      ).toBe('https://www.forbesjapan.com/articles/detail/12345');
    });

    it('should reject URLs exceeding max length (2048)', () => {
      const longUrl = '/articles/detail/' + 'a'.repeat(3000);
      expect(fetcher.validateArticleUrl(longUrl)).toBeUndefined();
    });

    it('should handle empty string', () => {
      expect(fetcher.validateArticleUrl('')).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // 11. validateThumbnailUrl() - thumbnail URL validation
  // ------------------------------------------------------------------
  describe('validateThumbnailUrl()', () => {
    it('should accept valid thumbnail URLs from allowed hosts', () => {
      expect(
        fetcher.validateThumbnailUrl('https://forbesjapan.com/media/photo.jpg')
      ).toBe('https://forbesjapan.com/media/photo.jpg');
    });

    it('should handle protocol-relative URLs', () => {
      expect(
        fetcher.validateThumbnailUrl('//forbesjapan.com/media/photo.jpg')
      ).toBe('https://forbesjapan.com/media/photo.jpg');
    });

    it('should handle absolute path URLs (no host)', () => {
      expect(fetcher.validateThumbnailUrl('/media/photo.jpg')).toBe(
        'https://forbesjapan.com/media/photo.jpg'
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
        fetcher.validateThumbnailUrl(
          'https://user:pass@forbesjapan.com/img.jpg'
        )
      ).toBeUndefined();
    });

    it('should reject thumbnails exceeding max length', () => {
      const longUrl = 'https://forbesjapan.com/' + 'a'.repeat(3000);
      expect(fetcher.validateThumbnailUrl(longUrl)).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // 12. createFetcher integration
  // ------------------------------------------------------------------
  describe('createFetcher()', () => {
    it('should return ForbesJapanFetcher for source name "Forbes Japan AI"', () => {
      const fetcher = createFetcher(mockSource);

      expect(fetcher).toBeInstanceOf(ForbesJapanFetcher);
    });
  });
});
