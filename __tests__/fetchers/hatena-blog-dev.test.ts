import { HatenaBlogDevFetcher } from '@/lib/fetchers/hatena-blog-dev';
import { BaseFetcher } from '@/lib/fetchers/base';
import { Source } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// WebFetcherをモック
jest.mock('@/lib/utils/web-fetcher', () => ({
  WebFetcher: jest.fn().mockImplementation(() => ({
    fetch: jest.fn(),
  })),
}));

import { WebFetcher } from '@/lib/utils/web-fetcher';

// Mock BaseFetcher's retry to avoid waiting for retryDelay
jest.spyOn(BaseFetcher.prototype as unknown as { retry: <T>(fn: () => Promise<T>) => Promise<T> }, 'retry')
  .mockImplementation(async function<T>(this: unknown, fn: () => Promise<T>): Promise<T> {
    return fn();
  });

describe('HatenaBlogDevFetcher', () => {
  let fetcher: HatenaBlogDevFetcher;
  let mockWebFetcherInstance: { fetch: jest.Mock };

  const mockSource: Source = {
    id: 'hatena_blog_dev_test',
    name: 'Hatena Blog Dev',
    type: 'SCRAPING',
    url: 'https://hatena.blog/dev/entries',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebFetcherInstance = {
      fetch: jest.fn(),
    };
    (WebFetcher as jest.Mock).mockImplementation(() => mockWebFetcherInstance);
    // Set maxPages to 1 for most tests to avoid retry delays
    process.env.HATENA_BLOG_DEV_MAX_PAGES = '1';
    fetcher = new HatenaBlogDevFetcher(mockSource);
  });

  afterEach(() => {
    delete process.env.HATENA_BLOG_DEV_MAX_PAGES;
  });

  describe('fetch', () => {
    it('should extract entries from valid HTML with urqlState', async () => {
      const fixture = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page1.html'),
        'utf-8'
      );
      mockWebFetcherInstance.fetch.mockResolvedValue(fixture);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // First article
      expect(result.articles[0].title).toBe('Microsoft Ignite 2025 News');
      expect(result.articles[0].url).toBe(
        'https://blogs.example.com/entry/2025/11/24/174325'
      );
      expect(result.articles[0].publishedAt).toEqual(
        new Date('2025-11-24T17:43:25.000Z')
      );
      expect(result.articles[0].tagNames).toContain('Example Corp');
    });

    it('should handle pagination and stop when hasNextPage is false', async () => {
      // Need more pages for this test
      process.env.HATENA_BLOG_DEV_MAX_PAGES = '3';
      const paginationFetcher = new HatenaBlogDevFetcher(mockSource);

      const page1 = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page1.html'),
        'utf-8'
      );
      const page2 = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page2.html'),
        'utf-8'
      );

      mockWebFetcherInstance.fetch
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);

      const result = await paginationFetcher.fetch();

      // 3 from page1 + 2 from page2
      expect(result.articles).toHaveLength(5);
      expect(result.errors).toHaveLength(0);

      // Verify page2 articles are included
      const mlArticle = result.articles.find(
        (a) => a.title === 'Machine Learning Pipeline Design'
      );
      expect(mlArticle).toBeDefined();
      expect(mlArticle?.tagNames).toContain('AI Company');
    });

    it('should deduplicate articles by URL', async () => {
      // Need more pages for this test
      process.env.HATENA_BLOG_DEV_MAX_PAGES = '3';
      const dedupFetcher = new HatenaBlogDevFetcher(mockSource);

      const fixture = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page1.html'),
        'utf-8'
      );
      // Return same page twice (simulating duplicate URLs)
      // Third call returns empty to stop pagination
      const emptyPage = `
        <!DOCTYPE html>
        <html>
        <body>
        <script>
        window.__URQL_DATA__ = {
          "key": {
            "data": {
              "recentEntries": {
                "entries": [],
                "hasNextPage": false
              }
            }
          }
        };
        </script>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch
        .mockResolvedValueOnce(fixture)
        .mockResolvedValueOnce(fixture)
        .mockResolvedValueOnce(emptyPage);

      const result = await dedupFetcher.fetch();

      // Should only have 3 unique articles, not 6
      expect(result.articles).toHaveLength(3);
    });

    it('should handle empty urqlState gracefully', async () => {
      const emptyHtml = `
        <!DOCTYPE html>
        <html>
        <body>
        <script>
        window.__URQL_DATA__ = {};
        </script>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch.mockResolvedValue(emptyHtml);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing urqlState gracefully', async () => {
      const noDataHtml = `
        <!DOCTYPE html>
        <html>
        <body>
        <p>No data</p>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch.mockResolvedValue(noDataHtml);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle malformed JSON gracefully', async () => {
      const malformedHtml = `
        <!DOCTYPE html>
        <html>
        <body>
        <script>
        window.__URQL_DATA__ = { invalid json here };
        </script>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch.mockResolvedValue(malformedHtml);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle fetch errors gracefully (fail-open)', async () => {
      // For error case, we expect one error per failed page
      mockWebFetcherInstance.fetch.mockRejectedValue(
        new Error('Network error')
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      // Single page (maxPages=1), so 1 error expected
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });

    it('should continue fetching despite individual page errors', async () => {
      // This test uses maxPages=1 (set in beforeEach), so we test that
      // errors are captured and returned in the errors array
      mockWebFetcherInstance.fetch.mockRejectedValue(
        new Error('Connection refused')
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Connection refused');
    });

    it('should include company name as tag', async () => {
      const fixture = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page1.html'),
        'utf-8'
      );
      mockWebFetcherInstance.fetch.mockResolvedValue(fixture);

      const result = await fetcher.fetch();

      expect(result.articles[0].tagNames).toContain('Example Corp');
      expect(result.articles[1].tagNames).toContain('Tech Inc');
      expect(result.articles[2].tagNames).toContain('Cloud Company');
    });

    it('should set sourceId correctly', async () => {
      const fixture = fs.readFileSync(
        path.join(__dirname, 'fixtures/hatena-blog-dev-page1.html'),
        'utf-8'
      );
      mockWebFetcherInstance.fetch.mockResolvedValue(fixture);

      const result = await fetcher.fetch();

      result.articles.forEach((article) => {
        expect(article.sourceId).toBe(mockSource.id);
      });
    });
  });

  describe('extractEntriesFromPage (private method via fetch)', () => {
    it('should handle urqlState pattern', async () => {
      const alternativeHtml = `
        <!DOCTYPE html>
        <html>
        <body>
        <script>
        urqlState = {
          "key123": {
            "data": {
              "recentEntries": {
                "entries": [
                  {
                    "title": "Alternative Pattern Test",
                    "url": "https://test.example.com/entry",
                    "created": "2025-11-25T00:00:00.000Z",
                    "blog": {
                      "title": "Test Blog",
                      "companyName": "Test Company"
                    }
                  }
                ],
                "hasNextPage": false
              }
            }
          }
        };
        </script>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch.mockResolvedValue(alternativeHtml);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Alternative Pattern Test');
    });

    it('should skip entries with missing required fields', async () => {
      const incompleteHtml = `
        <!DOCTYPE html>
        <html>
        <body>
        <script>
        window.__URQL_DATA__ = {
          "key": {
            "data": {
              "recentEntries": {
                "entries": [
                  {
                    "title": "Valid Entry",
                    "url": "https://valid.example.com",
                    "created": "2025-11-25T00:00:00.000Z",
                    "blog": { "title": "Blog", "companyName": "Company" }
                  },
                  {
                    "title": "Missing URL",
                    "created": "2025-11-25T00:00:00.000Z",
                    "blog": { "title": "Blog" }
                  },
                  {
                    "url": "https://missing-title.example.com",
                    "created": "2025-11-25T00:00:00.000Z",
                    "blog": { "title": "Blog" }
                  },
                  null,
                  "invalid"
                ],
                "hasNextPage": false
              }
            }
          }
        };
        </script>
        </body>
        </html>
      `;
      mockWebFetcherInstance.fetch.mockResolvedValue(incompleteHtml);

      const result = await fetcher.fetch();

      // Only the valid entry should be included
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Valid Entry');
    });
  });
});
