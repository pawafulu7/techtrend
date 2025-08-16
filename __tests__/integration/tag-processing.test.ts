import { DevToFetcher } from '@/lib/fetchers/devto';
import { normalizeTagInput } from '@/lib/utils/tag-normalizer';
import { Source } from '@prisma/client';
import { createDevToMockImplementation, createTestArticle } from '../helpers/devto-mock';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Tag Processing Integration', () => {
  
  let mockSource: Source;
  let fetcher: DevToFetcher;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSource = {
      id: 'test-devto-source',
      name: 'Dev.to',
      url: 'https://dev.to',
      type: 'api',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Source;

    fetcher = new DevToFetcher(mockSource);
  });

  describe('Dev.to Tag Processing', () => {
    it('should handle tag_list as array from list API', async () => {
      const mockArticlesResponse = [
        {
          id: 1,
          title: 'Test Article',
          description: 'Test description',
          url: 'https://dev.to/test/article',
          published_at: '2025-01-01T00:00:00Z',
          tag_list: ['javascript', 'react', 'webdev'], // Array format
          user: { name: 'Test User', username: 'testuser' },
          cover_image: null,
          positive_reactions_count: 20,
          comments_count: 5,
          reading_time_minutes: 3,
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockArticlesResponse,
      });

      // Mock the detail API call
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockArticlesResponse[0],
          body_html: '<p>Article content</p>',
        }),
      });

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].tagNames).toEqual(
        normalizeTagInput(['javascript', 'react', 'webdev'])
      );
      expect(result.articles[0].tagNames).toContain('JavaScript');
      expect(result.articles[0].tagNames).toContain('React');
      expect(result.articles[0].tagNames).toContain('Webdev');
    }, 30000);

    it('should handle tag_list as string from detail API', async () => {
      const mockListResponse = [
        {
          id: 2,
          title: 'Another Test Article',
          description: 'Another test description',
          url: 'https://dev.to/test/another-article',
          published_at: '2025-01-02T00:00:00Z',
          tag_list: ['typescript'], // Initial array format
          user: { name: 'Test User', username: 'testuser' },
          cover_image: null,
          positive_reactions_count: 15,
          comments_count: 3,
          reading_time_minutes: 5,
        },
      ];

      const mockDetailResponse = {
        ...mockListResponse[0],
        tag_list: 'typescript, nodejs, testing', // String format from detail API
        body_html: '<p>Detailed article content</p>',
        body_markdown: '# Detailed article content',
      };

      (global.fetch as jest.Mock).mockImplementation((url) => {
        // 詳細APIのパターンを先に判定（/articles/数字）
        if (url.match(/\/articles\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockDetailResponse,
          });
        }
        // リストAPIのパターン（/articles?クエリパラメータ）
        if (url.includes('/articles?')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockListResponse,
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].tagNames).toEqual(
        normalizeTagInput('typescript, nodejs, testing')
      );
      expect(result.articles[0].tagNames).toContain('TypeScript');
      expect(result.articles[0].tagNames).toContain('Node.js');
      expect(result.articles[0].tagNames).toContain('Testing');
    }, 30000);

    it('should filter out single character tags', async () => {
      fetcher = new DevToFetcher(mockSource); // 新しいインスタンスを作成
      
      const mockArticleWithBadTags = createTestArticle({
        id: 3,
        title: 'Article with Bad Tags',
        description: 'Test',
        url: 'https://dev.to/test/bad-tags',
        published_at: '2025-01-03T00:00:00Z',
        tag_list: 'a, b, c, react, x, y, z, 5', // Mix of valid and invalid tags
        positive_reactions_count: 10,
        comments_count: 2,
        reading_time_minutes: 2,
        body_html: '<p>Content</p>',
      });

      // ヘルパーを使用してモック実装を作成
      (global.fetch as jest.Mock).mockImplementation(
        createDevToMockImplementation([mockArticleWithBadTags])
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].tagNames).toEqual(['React', '5']); // Only valid tags (順序は実装依存)
      expect(result.articles[0].tagNames).not.toContain('a');
      expect(result.articles[0].tagNames).not.toContain('b');
      expect(result.articles[0].tagNames).not.toContain('c');
    }, 30000);

    it('should handle empty or missing tag_list', async () => {
      const mockArticlesWithNoTags = [
        {
          id: 4,
          title: 'No Tags Article',
          description: 'Test',
          url: 'https://dev.to/test/no-tags',
          published_at: '2025-01-04T00:00:00Z',
          tag_list: null, // No tags
          user: { name: 'Test User', username: 'testuser' },
          cover_image: null,
          positive_reactions_count: 12,
          comments_count: 1,
          reading_time_minutes: 3,
        },
        {
          id: 5,
          title: 'Empty Tags Article',
          description: 'Test',
          url: 'https://dev.to/test/empty-tags',
          published_at: '2025-01-05T00:00:00Z',
          tag_list: '', // Empty string
          user: { name: 'Test User', username: 'testuser' },
          cover_image: null,
          positive_reactions_count: 11,
          comments_count: 0,
          reading_time_minutes: 2,
        },
      ];

      // Test first article (null tag_list)
      (global.fetch as jest.Mock).mockImplementation((url) => {
        // 詳細APIのパターンを先に判定
        if (url.match(/\/articles\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...mockArticlesWithNoTags[0], body_html: '<p>Content</p>' }),
          });
        }
        // リストAPIのパターン
        if (url.includes('/articles?')) {
          return Promise.resolve({
            ok: true,
            json: async () => [mockArticlesWithNoTags[0]],
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result1 = await fetcher.fetch();
      expect(result1.articles).toHaveLength(1);
      expect(result1.articles[0].tagNames).toEqual([]);
      
      // Test second article (empty string tag_list)
      (global.fetch as jest.Mock).mockImplementation((url) => {
        // 詳細APIのパターンを先に判定
        if (url.match(/\/articles\/\d+$/)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...mockArticlesWithNoTags[1], body_html: '<p>Content</p>' }),
          });
        }
        // リストAPIのパターン
        if (url.includes('/articles?')) {
          return Promise.resolve({
            ok: true,
            json: async () => [mockArticlesWithNoTags[1]],
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result2 = await fetcher.fetch();
      expect(result2.articles).toHaveLength(1);
      expect(result2.articles[0].tagNames).toEqual([]);
    }, 30000);

    it('should handle malformed tag strings gracefully', async () => {
      fetcher = new DevToFetcher(mockSource); // 新しいインスタンスを作成
      
      const mockArticleWithMalformedTags = createTestArticle({
        id: 6,
        title: 'Malformed Tags Article',
        description: 'Test',
        url: 'https://dev.to/test/malformed',
        published_at: '2025-01-06T00:00:00Z',
        tag_list: ',,,,javascript,,,react,,,', // Malformed with extra commas
        positive_reactions_count: 14,
        comments_count: 4,
        reading_time_minutes: 4,
        body_html: '<p>Content</p>',
      });

      // ヘルパーを使用してモック実装を作成
      (global.fetch as jest.Mock).mockImplementation(
        createDevToMockImplementation([mockArticleWithMalformedTags])
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].tagNames).toEqual(['JavaScript', 'React']);
      expect(result.articles[0].tagNames).toHaveLength(2); // Only valid tags, no empty strings
    }, 30000);
  });

  describe('Tag Normalization Consistency', () => {
    it('should produce consistent results regardless of input format', () => {
      const stringInput = 'javascript, typescript, react, nodejs';
      const arrayInput = ['javascript', 'typescript', 'react', 'nodejs'];
      const mixedCaseInput = ['JavaScript', 'TypeScript', 'React', 'NodeJS'];
      const withSpacesInput = '  javascript  ,  typescript  ,  react  ,  nodejs  ';

      const result1 = normalizeTagInput(stringInput);
      const result2 = normalizeTagInput(arrayInput);
      const result3 = normalizeTagInput(mixedCaseInput);
      const result4 = normalizeTagInput(withSpacesInput);

      // All should produce the same normalized output
      const expected = ['JavaScript', 'TypeScript', 'React', 'Node.js'];
      expect(result1).toEqual(expected);
      expect(result2).toEqual(expected);
      expect(result3).toEqual(expected);
      expect(result4).toEqual(expected);
    });

    it('should handle real-world Dev.to API response variations', () => {
      // Test data based on actual Dev.to API responses
      const testCases = [
        {
          input: 'webdev, javascript, programming, opensource',
          expected: ['Webdev', 'JavaScript', 'Opensource'], // 'programming' filtered as generic
        },
        {
          input: ['react', 'hooks', 'javascript', 'webdev'],
          expected: ['React', 'Hooks', 'JavaScript', 'Webdev'],
        },
        {
          input: 'python,machinelearning,ai,datascience',
          expected: ['Python', 'AI', 'Datascience', '機械学習'], // 機械学習タグも含まれる可能性がある
        },
        {
          input: ['typescript', 'node', 'express', 'mongodb'],
          expected: ['TypeScript', 'Node.js', 'Express', 'MongoDB'],
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = normalizeTagInput(input);
        expect(result.sort()).toEqual(expected.sort());
      });
    });
  });
});