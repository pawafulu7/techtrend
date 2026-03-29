import { HatenaBlogDevFetcher } from '@/lib/fetchers/hatena-blog-dev';
import { BaseFetcher } from '@/lib/fetchers/base';
import { Source } from '@prisma/client';
import { resetEnvCache } from '@/lib/config/env';

// Mock BaseFetcher's retry to avoid waiting for retryDelay
jest.spyOn(BaseFetcher.prototype as unknown as { retry: <T>(fn: () => Promise<T>) => Promise<T> }, 'retry')
  .mockImplementation(async function<T>(this: unknown, fn: () => Promise<T>): Promise<T> {
    return fn();
  });

describe('HatenaBlogDevFetcher', () => {
  let fetcher: HatenaBlogDevFetcher;
  let mockFetch: jest.SpyInstance;

  const mockSource: Source = {
    id: 'hatena_blog_dev_test',
    name: '企業技術ブログ',
    type: 'SCRAPING',
    url: 'https://hatena.blog/dev/entries',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // GraphQL response fixtures
  const createGraphQLResponse = (entries: unknown[], hasNextPage: boolean) => ({
    data: {
      recentEntries: {
        entries,
        hasNextPage,
      },
    },
  });

  const mockEntries = {
    page1: [
      {
        title: 'Microsoft Ignite 2025 News',
        url: 'https://blogs.example.com/entry/2025/11/24/174325',
        created: '2025-11-24T17:43:25.000Z',
        blog: { title: 'Example Tech Blog', companyName: 'Example Corp' },
      },
      {
        title: 'Building Scalable APIs with Go',
        url: 'https://tech.example.org/entry/go-apis',
        created: '2025-11-24T16:00:00.000Z',
        blog: { title: 'TechBlog', companyName: 'Tech Inc' },
      },
      {
        title: 'Cloud Native Development Best Practices',
        url: 'https://developer.example.io/entry/cloud-native',
        created: '2025-11-24T12:04:04.000Z',
        blog: { title: 'Developer Blog', companyName: 'Cloud Company' },
      },
    ],
    page2: [
      {
        title: 'Machine Learning Pipeline Design',
        url: 'https://ml.example.com/entry/ml-pipeline',
        created: '2025-11-23T10:00:00.000Z',
        blog: { title: 'AI Blog', companyName: 'AI Company' },
      },
      {
        title: 'Kubernetes Security Hardening',
        url: 'https://k8s.example.com/entry/security',
        created: '2025-11-23T08:00:00.000Z',
        blog: { title: 'K8s Blog', companyName: 'Cloud Company' },
      },
    ],
  };

  const createMockResponse = (body: unknown, status = 200) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch');
    // Set maxPages to 1 for most tests
    process.env.HATENA_BLOG_DEV_MAX_PAGES = '1';
    resetEnvCache();
    fetcher = new HatenaBlogDevFetcher(mockSource);
  });

  afterEach(() => {
    mockFetch.mockRestore();
    delete process.env.HATENA_BLOG_DEV_MAX_PAGES;
    resetEnvCache();
  });

  describe('fetch', () => {
    it('should extract entries from valid GraphQL response', async () => {
      const response = createGraphQLResponse(mockEntries.page1, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

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
      resetEnvCache();
      const paginationFetcher = new HatenaBlogDevFetcher(mockSource);

      const page1Response = createGraphQLResponse(mockEntries.page1, true);
      const page2Response = createGraphQLResponse(mockEntries.page2, false);

      mockFetch
        .mockResolvedValueOnce(createMockResponse(page1Response))
        .mockResolvedValueOnce(createMockResponse(page2Response));

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
      resetEnvCache();
      const dedupFetcher = new HatenaBlogDevFetcher(mockSource);

      const page1Response = createGraphQLResponse(mockEntries.page1, true);
      const emptyResponse = createGraphQLResponse([], false);

      // Return same entries twice (simulating duplicate URLs), then empty to stop
      mockFetch
        .mockResolvedValueOnce(createMockResponse(page1Response))
        .mockResolvedValueOnce(createMockResponse(page1Response))
        .mockResolvedValueOnce(createMockResponse(emptyResponse));

      const result = await dedupFetcher.fetch();

      // Should only have 3 unique articles, not 6
      expect(result.articles).toHaveLength(3);
    });

    it('should handle empty entries gracefully', async () => {
      const emptyResponse = createGraphQLResponse([], false);
      mockFetch.mockResolvedValue(createMockResponse(emptyResponse));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing recentEntries gracefully', async () => {
      const invalidResponse = { data: {} };
      mockFetch.mockResolvedValue(createMockResponse(invalidResponse));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('missing recentEntries');
    });

    it('should handle GraphQL errors gracefully', async () => {
      const errorResponse = {
        errors: [{ message: 'Query validation failed' }],
      };
      mockFetch.mockResolvedValue(createMockResponse(errorResponse));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('GraphQL errors');
    });

    it('should handle fetch errors gracefully (fail-open)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      // Single page (maxPages=1), so 1 error expected
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('HTTP 500');
    });

    it('should continue fetching despite individual page errors', async () => {
      process.env.HATENA_BLOG_DEV_MAX_PAGES = '2';
      resetEnvCache();
      const multiFetcher = new HatenaBlogDevFetcher(mockSource);

      const page2Response = createGraphQLResponse(mockEntries.page2, false);

      // First page fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(createMockResponse(page2Response));

      const result = await multiFetcher.fetch();

      // Should have articles from page2
      expect(result.articles).toHaveLength(2);
      // Should have error from page1
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Connection refused');
    });

    it('should include company name as tag', async () => {
      const response = createGraphQLResponse(mockEntries.page1, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

      const result = await fetcher.fetch();

      expect(result.articles[0].tagNames).toContain('Example Corp');
      expect(result.articles[1].tagNames).toContain('Tech Inc');
      expect(result.articles[2].tagNames).toContain('Cloud Company');
    });

    it('should set sourceId correctly', async () => {
      const response = createGraphQLResponse(mockEntries.page1, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

      const result = await fetcher.fetch();

      result.articles.forEach((article) => {
        expect(article.sourceId).toBe(mockSource.id);
      });
    });

    it('should call GraphQL endpoint with correct parameters', async () => {
      const response = createGraphQLResponse(mockEntries.page1, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

      await fetcher.fetch();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hatena.blog/dev/api/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify request body contains query and variables
      const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(callArgs.body as string);
      expect(body.query).toContain('query RecentEntries');
      expect(body.variables).toEqual({ limit: 20, skip: 0 });
    });
  });

  describe('entry validation', () => {
    it('should skip entries with missing required fields', async () => {
      const mixedEntries = [
        // Valid entry
        {
          title: 'Valid Entry',
          url: 'https://valid.example.com',
          created: '2025-11-25T00:00:00.000Z',
          blog: { title: 'Blog', companyName: 'Company' },
        },
        // Missing URL
        {
          title: 'Missing URL',
          created: '2025-11-25T00:00:00.000Z',
          blog: { title: 'Blog' },
        },
        // Missing title
        {
          url: 'https://missing-title.example.com',
          created: '2025-11-25T00:00:00.000Z',
          blog: { title: 'Blog' },
        },
        // Null entry
        null,
        // Invalid type
        'invalid',
      ];

      const response = createGraphQLResponse(mixedEntries, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

      const result = await fetcher.fetch();

      // Only the valid entry should be included
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Valid Entry');
    });

    it('should handle entries without company name', async () => {
      const entriesWithoutCompany = [
        {
          title: 'No Company Entry',
          url: 'https://no-company.example.com',
          created: '2025-11-25T00:00:00.000Z',
          blog: { title: 'Blog' }, // No companyName
        },
      ];

      const response = createGraphQLResponse(entriesWithoutCompany, false);
      mockFetch.mockResolvedValue(createMockResponse(response));

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].tagNames).toEqual([]);
    });
  });

  describe('environment variable configuration', () => {
    it('should respect HATENA_BLOG_DEV_MAX_PAGES', async () => {
      process.env.HATENA_BLOG_DEV_MAX_PAGES = '2';
      resetEnvCache();
      const configuredFetcher = new HatenaBlogDevFetcher(mockSource);

      const page1Response = createGraphQLResponse(mockEntries.page1, true);
      const page2Response = createGraphQLResponse(mockEntries.page2, true);

      mockFetch
        .mockResolvedValueOnce(createMockResponse(page1Response))
        .mockResolvedValueOnce(createMockResponse(page2Response));

      const result = await configuredFetcher.fetch();

      // Should stop after 2 pages even though hasNextPage is true
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.articles).toHaveLength(5);
    });

    it('should default to 3 pages when env var is not set', async () => {
      delete process.env.HATENA_BLOG_DEV_MAX_PAGES;
      resetEnvCache();
      const defaultFetcher = new HatenaBlogDevFetcher(mockSource);

      const pageResponse = createGraphQLResponse(mockEntries.page1, true);
      const emptyResponse = createGraphQLResponse([], false);

      mockFetch
        .mockResolvedValueOnce(createMockResponse(pageResponse))
        .mockResolvedValueOnce(createMockResponse(pageResponse))
        .mockResolvedValueOnce(createMockResponse(emptyResponse));

      await defaultFetcher.fetch();

      // Should fetch up to 3 pages (stops at 3rd because empty)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
