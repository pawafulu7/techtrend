import { LedgeAiFetcher } from '@/lib/fetchers/ledge-ai';
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
  id: 'ledge_ai',
  name: 'Ledge.ai',
  type: 'SCRAPER',
  url: 'https://ledge.ai',
  enabled: true,
  groupId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Type for building mock Strapi articles
interface StrapiArticlePartial {
  id?: number;
  documentId?: string;
  title?: string;
  slug?: string;
  scheduled_at?: string | null;
  meta_description?: string | null;
  is_promotional?: boolean;
  publishedAt?: string | null;
  thumbnail?: {
    url: string;
    formats: {
      large?: { url: string; width: number; height: number };
      medium?: { url: string; width: number; height: number };
      small?: { url: string; width: number; height: number };
      thumbnail?: { url: string; width: number; height: number };
    };
  } | null;
  main_category?: { name: string; slug: string } | null;
  tags?: { name: string }[];
  contents?: { content: string }[];
}

function buildStrapiResponse(articles: StrapiArticlePartial[]): object {
  return {
    data: articles.map((a, i) => ({
      id: a.id ?? 10000 + i,
      documentId: a.documentId ?? `doc_${i}`,
      title: a.title ?? `Test Article ${i}`,
      slug: a.slug ?? `test-article-${i}`,
      scheduled_at: a.scheduled_at ?? null,
      meta_description: a.meta_description ?? null,
      is_promotional: a.is_promotional ?? false,
      publishedAt:
        a.publishedAt !== undefined ? a.publishedAt : new Date().toISOString(),
      thumbnail: a.thumbnail ?? null,
      main_category: a.main_category ?? null,
      tags: a.tags ?? [],
      contents: a.contents ?? [{ content: 'Test content' }],
    })),
    meta: {
      pagination: {
        page: 1,
        pageSize: 30,
        pageCount: 1,
        total: articles.length,
      },
    },
  };
}

function mockApiSuccess(response: object): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(response),
  });
}

function mockApiFailure(status: number): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    statusText: `Error ${status}`,
  });
}

describe('LedgeAiFetcher', () => {
  let fetcher: LedgeAiFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Set system time to 2026-03-02 00:00:00 UTC
    jest.setSystemTime(new Date('2026-03-02T00:00:00Z'));
    fetcher = new LedgeAiFetcher(mockSource);
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
      expect(fetcher).toBeInstanceOf(LedgeAiFetcher);
    });
  });

  // ------------------------------------------------------------------
  // 2. fetch() - API response parsing & article extraction
  // ------------------------------------------------------------------
  describe('fetch()', () => {
    describe('successful scenarios', () => {
      it('should extract articles from Strapi API response', async () => {
        const response = buildStrapiResponse([
          {
            title: 'AI Article One',
            slug: 'ai-article-one',
            publishedAt: '2026-03-01T10:00:00Z',
            tags: [{ name: 'AI' }, { name: 'ML' }],
            contents: [{ content: 'Article one content' }],
          },
          {
            title: 'AI Article Two',
            slug: 'ai-article-two',
            publishedAt: '2026-02-28T08:00:00Z',
            tags: [{ name: 'LLM' }],
            contents: [{ content: 'Article two content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(2);
        expect(result.errors).toEqual([]);
      });

      it('should parse all article fields correctly', async () => {
        const response = buildStrapiResponse([
          {
            title: 'Ledge.ai Test Article',
            slug: 'ledge-ai-test-article',
            publishedAt: '2026-03-01T10:00:00Z',
            tags: [{ name: 'AI' }, { name: 'Deep Learning' }],
            contents: [{ content: 'Full article content here' }],
            thumbnail: {
              url: 'https://storage.googleapis.com/img/full.jpg',
              formats: {
                small: {
                  url: 'https://storage.googleapis.com/img/small.jpg',
                  width: 300,
                  height: 200,
                },
              },
            },
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();
        const article = result.articles[0];

        expect(article.title).toBe('Ledge.ai Test Article');
        expect(article.url).toBe(
          'https://ledge.ai/articles/ledge-ai-test-article'
        );
        expect(article.content).toBe('Full article content here');
        expect(article.publishedAt).toEqual(new Date('2026-03-01T10:00:00Z'));
        expect(article.sourceId).toBe('ledge_ai');
        expect(article.tagNames).toEqual(['AI', 'Deep Learning']);
        expect(article.thumbnail).toBe(
          'https://storage.googleapis.com/img/small.jpg'
        );
      });

      it('should limit articles to 30 (paginationLimit) client-side', async () => {
        const articles = Array(35)
          .fill(0)
          .map((_, i) => ({
            slug: `article-${i}`,
            title: `Article ${i}`,
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: `Content ${i}` }],
          }));
        mockApiSuccess(buildStrapiResponse(articles));

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(30);
      });
    });

    // ------------------------------------------------------------------
    // 3. Duplicate URL deduplication
    // ------------------------------------------------------------------
    describe('duplicate URL handling', () => {
      it('should deduplicate articles with the same slug', async () => {
        const response = buildStrapiResponse([
          {
            id: 1,
            slug: 'same-article',
            title: 'First occurrence',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Content 1' }],
          },
          {
            id: 2,
            slug: 'same-article',
            title: 'Second occurrence',
            publishedAt: '2026-03-01T11:00:00Z',
            contents: [{ content: 'Content 2' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
        expect(result.articles[0].title).toBe('First occurrence');
      });
    });

    // ------------------------------------------------------------------
    // 4. Content extraction
    // ------------------------------------------------------------------
    describe('content extraction', () => {
      it('should extract first non-empty content from contents array', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'content-test',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [
              { content: '' },
              { content: '  ' },
              { content: 'Actual content here' },
              { content: 'Ignored content' },
            ],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].content).toBe('Actual content here');
      });

      it('should return empty string when all contents are empty', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'empty-content',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: '' }, { content: '   ' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].content).toBe('');
      });

      it('should return empty string when contents array is empty', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'no-content',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].content).toBe('');
      });
    });

    // ------------------------------------------------------------------
    // 5. Date processing
    // ------------------------------------------------------------------
    describe('date processing', () => {
      it('should use publishedAt as primary date', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'date-test',
            publishedAt: '2026-03-01T10:00:00Z',
            scheduled_at: '2026-02-28T08:00:00Z',
            contents: [{ content: 'Content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].publishedAt).toEqual(
          new Date('2026-03-01T10:00:00Z')
        );
      });

      it('should fall back to scheduled_at when publishedAt is null', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'scheduled-test',
            publishedAt: null,
            scheduled_at: '2026-02-28T08:00:00Z',
            contents: [{ content: 'Content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].publishedAt).toEqual(
          new Date('2026-02-28T08:00:00Z')
        );
      });

      it('should filter out articles older than 30 days', async () => {
        // System time: 2026-03-02. 30 days ago: 2026-01-31
        const response = buildStrapiResponse([
          {
            slug: 'old-article',
            publishedAt: '2026-01-15T10:00:00Z',
            contents: [{ content: 'Old content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should filter out future dated articles', async () => {
        // System time: 2026-03-02T00:00:00Z
        const response = buildStrapiResponse([
          {
            slug: 'future-article',
            publishedAt: '2026-04-01T10:00:00Z',
            contents: [{ content: 'Future content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(0);
      });

      it('should keep articles within the 30-day window', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'recent-article',
            publishedAt: '2026-02-20T10:00:00Z',
            contents: [{ content: 'Recent content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
      });
    });

    // ------------------------------------------------------------------
    // 6. Thumbnail extraction
    // ------------------------------------------------------------------
    describe('thumbnail extraction', () => {
      it('should prefer thumbnail.formats.small.url', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'thumb-small',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Content' }],
            thumbnail: {
              url: 'https://storage.googleapis.com/img/full.jpg',
              formats: {
                small: {
                  url: 'https://storage.googleapis.com/img/small.jpg',
                  width: 300,
                  height: 200,
                },
                medium: {
                  url: 'https://storage.googleapis.com/img/medium.jpg',
                  width: 600,
                  height: 400,
                },
              },
            },
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBe(
          'https://storage.googleapis.com/img/small.jpg'
        );
      });

      it('should fall back to thumbnail.url when small format is missing', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'thumb-fallback',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Content' }],
            thumbnail: {
              url: 'https://storage.googleapis.com/img/full.jpg',
              formats: {},
            },
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBe(
          'https://storage.googleapis.com/img/full.jpg'
        );
      });

      it('should return undefined when thumbnail is null', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'no-thumb',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Content' }],
            thumbnail: null,
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles[0].thumbnail).toBeUndefined();
      });
    });

    // ------------------------------------------------------------------
    // 7. Promotional article filtering
    // ------------------------------------------------------------------
    describe('promotional article filtering', () => {
      it('should filter out articles with is_promotional=true', async () => {
        const response = buildStrapiResponse([
          {
            slug: 'promo-article',
            title: 'Promotional Article',
            publishedAt: '2026-03-01T10:00:00Z',
            is_promotional: true,
            contents: [{ content: 'Promo content' }],
          },
          {
            slug: 'normal-article',
            title: 'Normal Article',
            publishedAt: '2026-03-01T10:00:00Z',
            is_promotional: false,
            contents: [{ content: 'Normal content' }],
          },
        ]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBe(1);
        expect(result.articles[0].title).toBe('Normal Article');
      });
    });

    // ------------------------------------------------------------------
    // 7.5. Null-safe handling for schema anomalies
    // ------------------------------------------------------------------
    describe('null-safe handling', () => {
      it('should handle null tags gracefully without breaking other articles', async () => {
        const response = buildStrapiResponse([
          {
            id: 1,
            slug: 'null-tags-article',
            title: 'Article with null tags',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Content' }],
          },
          {
            id: 2,
            slug: 'normal-article',
            title: 'Normal Article',
            publishedAt: '2026-03-01T10:00:00Z',
            tags: [{ name: 'AI' }],
            contents: [{ content: 'Normal content' }],
          },
        ]);
        // Force tags to null on first article
        (response as { data: { tags: null }[] }).data[0].tags = null as never;
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        // Second article should still be processed
        expect(result.articles.length).toBeGreaterThanOrEqual(1);
        expect(result.articles.some((a) => a.title === 'Normal Article')).toBe(
          true
        );
      });

      it('should handle null contents gracefully without breaking other articles', async () => {
        const response = buildStrapiResponse([
          {
            id: 1,
            slug: 'null-contents-article',
            title: 'Article with null contents',
            publishedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 2,
            slug: 'normal-article-2',
            title: 'Normal Article 2',
            publishedAt: '2026-03-01T10:00:00Z',
            contents: [{ content: 'Normal content' }],
          },
        ]);
        // Force contents to null on first article
        (response as { data: { contents: null }[] }).data[0].contents =
          null as never;
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles.length).toBeGreaterThanOrEqual(1);
        expect(
          result.articles.some((a) => a.title === 'Normal Article 2')
        ).toBe(true);
      });
    });

    // ------------------------------------------------------------------
    // 8. Empty results
    // ------------------------------------------------------------------
    describe('empty results handling', () => {
      it('should return empty articles when API returns empty data', async () => {
        const response = buildStrapiResponse([]);
        mockApiSuccess(response);

        const result = await fetcher.fetch();

        expect(result.articles).toEqual([]);
        expect(result.errors).toEqual([]);
      });
    });

    // ------------------------------------------------------------------
    // 9. Error handling
    // ------------------------------------------------------------------
    describe('error handling', () => {
      it('should return errors array on fetch failure after retries', async () => {
        // retryLimit=3, so initial + 3 retries = 4 calls
        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'));

        const fetchPromise = fetcher.fetch();

        // Advance time for retry delays (1000ms each)
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Network error');
      });

      it('should return errors on HTTP error status after retries', async () => {
        // HTTP error triggers throw in fetchArticlesFromApi, which is retried
        mockApiFailure(500);
        mockApiFailure(500);
        mockApiFailure(500);
        mockApiFailure(500);

        const fetchPromise = fetcher.fetch();

        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toContain('HTTP error');
      });

      it('should return errors on invalid JSON response', async () => {
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON')),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON')),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON')),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON')),
          });

        const fetchPromise = fetcher.fetch();

        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);
        await jest.advanceTimersByTimeAsync(1000);

        const result = await fetchPromise;

        expect(result.articles).toEqual([]);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].message).toBe('Invalid JSON');
      });
    });
  });

  // ------------------------------------------------------------------
  // 10. validateArticleUrl()
  // ------------------------------------------------------------------
  describe('validateArticleUrl()', () => {
    it('should accept valid ledge.ai article URLs', () => {
      expect(
        fetcher.validateArticleUrl('https://ledge.ai/articles/test-article')
      ).toBe('https://ledge.ai/articles/test-article');
    });

    it('should reject URLs from non-whitelisted hosts', () => {
      expect(
        fetcher.validateArticleUrl('https://malicious-site.com/articles/test')
      ).toBeUndefined();
      expect(
        fetcher.validateArticleUrl('https://evil-ledge.ai/articles/test')
      ).toBeUndefined();
    });

    it('should reject javascript: URLs', () => {
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
        fetcher.validateArticleUrl('http://ledge.ai/articles/test')
      ).toBeUndefined();
    });

    it('should reject URLs with userinfo', () => {
      expect(
        fetcher.validateArticleUrl('https://user:pass@ledge.ai/articles/test')
      ).toBeUndefined();
    });

    it('should reject URLs exceeding max length (2048)', () => {
      const longUrl = 'https://ledge.ai/articles/' + 'a'.repeat(3000);
      expect(fetcher.validateArticleUrl(longUrl)).toBeUndefined();
    });

    it('should handle empty string', () => {
      expect(fetcher.validateArticleUrl('')).toBeUndefined();
    });

    it('should reject URLs with non-/articles/ path prefix', () => {
      expect(
        fetcher.validateArticleUrl('https://ledge.ai/categories/ai')
      ).toBeUndefined();
      expect(fetcher.validateArticleUrl('https://ledge.ai/')).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // 11. validateThumbnailUrl()
  // ------------------------------------------------------------------
  describe('validateThumbnailUrl()', () => {
    it('should accept valid thumbnail URLs from allowed hosts', () => {
      expect(
        fetcher.validateThumbnailUrl(
          'https://storage.googleapis.com/img/photo.jpg'
        )
      ).toBe('https://storage.googleapis.com/img/photo.jpg');
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
          'https://user:pass@storage.googleapis.com/img.jpg'
        )
      ).toBeUndefined();
    });

    it('should reject thumbnails exceeding max length', () => {
      const longUrl = 'https://storage.googleapis.com/' + 'a'.repeat(3000);
      expect(fetcher.validateThumbnailUrl(longUrl)).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // 12. createFetcher integration
  // ------------------------------------------------------------------
  describe('createFetcher()', () => {
    it('should return LedgeAiFetcher for source name "Ledge.ai"', () => {
      const result = createFetcher(mockSource);

      expect(result).toBeInstanceOf(LedgeAiFetcher);
    });
  });
});
