/**
 * GenericForeignRssFetcher カテゴリフィルタリングのテスト
 */

import { GenericForeignRssFetcher, ForeignSourceConfig } from '@/lib/fetchers/generic-foreign-rss';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';
import { logger } from '@/lib/logger';

// rss-parserをモック
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  }));
});
const MockedParser = jest.mocked(Parser);

// loggerをモック
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
const mockedLogger = jest.mocked(logger);

// duplicate-detectionをモック
jest.mock('@/lib/utils/duplicate-detection', () => ({
  isDuplicate: jest.fn().mockReturnValue(false),
}));

// url-normalizerをモック
jest.mock('@/lib/utils/url/url-normalizer', () => ({
  normalizeUrl: jest.fn((url: string) => url),
}));

const createMockSource = (name = 'Business Insider'): Source => ({
  id: 'business_insider',
  name,
  url: 'https://www.businessinsider.com',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockConfig = (overrides?: Partial<ForeignSourceConfig>): ForeignSourceConfig => ({
  feedUrl: 'https://feeds.businessinsider.com/custom/all',
  tagPrefix: 'BusinessInsider',
  categoryFilter: ['Tech', 'AI'],
  ...overrides,
});

// Atom形式のcategoryデータを生成
const createAtomCategory = (term: string, scheme?: string) => ({
  $: { term, ...(scheme ? { scheme } : {}) },
});

describe('GenericForeignRssFetcher categoryFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('categoryFilter設定時のフィルタリング', () => {
    it('該当カテゴリの記事のみ通過すること（Atom形式）', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Tech Article',
            link: 'https://example.com/tech-article',
            isoDate: '2026-03-01T00:00:00Z',
            category: [
              createAtomCategory('Tech', 'https://www.businessinsider.com/tech'),
            ],
          },
          {
            title: 'Finance Article',
            link: 'https://example.com/finance-article',
            isoDate: '2026-03-01T00:00:00Z',
            category: [
              createAtomCategory('Finance', 'https://www.businessinsider.com/finance'),
            ],
          },
          {
            title: 'AI Article',
            link: 'https://example.com/ai-article',
            isoDate: '2026-03-01T00:00:00Z',
            category: [
              createAtomCategory('AI', 'https://www.businessinsider.com/artificial-intelligence'),
            ],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].title).toBe('Tech Article');
      expect(result.articles[1].title).toBe('AI Article');
      expect(result.errors).toHaveLength(0);
      expect(mockParseURL).toHaveBeenCalledWith('https://feeds.businessinsider.com/custom/all');
    });

    it('複数カテゴリを持つ記事で1つでもマッチすれば通過すること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Multi Category Article',
            link: 'https://example.com/multi-cat',
            isoDate: '2026-03-01T00:00:00Z',
            category: [
              createAtomCategory('Sports'),
              createAtomCategory('Tech'),
              createAtomCategory('Finance'),
            ],
          },
          {
            title: 'No Match Article',
            link: 'https://example.com/no-match',
            isoDate: '2026-03-01T00:00:00Z',
            category: [
              createAtomCategory('Sports'),
              createAtomCategory('Finance'),
            ],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Multi Category Article');
    });

    it('case-insensitiveでマッチすること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Tech Lower',
            link: 'https://example.com/tech-lower',
            isoDate: '2026-03-01T00:00:00Z',
            category: [createAtomCategory('tech')],
          },
          {
            title: 'Tech Upper',
            link: 'https://example.com/tech-upper',
            isoDate: '2026-03-01T00:00:00Z',
            category: [createAtomCategory('TECH')],
          },
          {
            title: 'Tech Mixed',
            link: 'https://example.com/tech-mixed',
            isoDate: '2026-03-01T00:00:00Z',
            category: [createAtomCategory('TeCh')],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(3);
    });

    it('categoriesが空/undefinedの記事はフィルタで除外されること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'No Category',
            link: 'https://example.com/no-category',
            isoDate: '2026-03-01T00:00:00Z',
            // category なし
          },
          {
            title: 'Empty Category',
            link: 'https://example.com/empty-category',
            isoDate: '2026-03-01T00:00:00Z',
            category: [],
          },
          {
            title: 'Tech Article',
            link: 'https://example.com/tech',
            isoDate: '2026-03-01T00:00:00Z',
            category: [createAtomCategory('Tech')],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Tech Article');
    });

    it('category が単体オブジェクト（keepArray未適用時のフォールバック）でもフィルタが動作すること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Single Category Tech',
            link: 'https://example.com/single-cat',
            isoDate: '2026-03-01T00:00:00Z',
            // keepArray未適用時: 単体オブジェクト（配列ではない）
            category: createAtomCategory('Tech', 'https://www.businessinsider.com/tech'),
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Single Category Tech');
    });

    it('RSS形式のcategories（string[]）でもフィルタが動作すること', async () => {
      // RSS 2.0形式では categories (複数形) フィールドに文字列配列としてカテゴリが格納される
      // Atom形式の category フィールド（オブジェクト配列）とは異なる形式
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'RSS Tech',
            link: 'https://example.com/rss-tech',
            isoDate: '2026-03-01T00:00:00Z',
            categories: ['Tech', 'Innovation'],
          },
          {
            title: 'RSS Sports',
            link: 'https://example.com/rss-sports',
            isoDate: '2026-03-01T00:00:00Z',
            categories: ['Sports', 'NFL'],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('RSS Tech');
    });

    it('RSS形式のcategories（object[]）でもフィルタが動作すること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'RSS Object Tech',
            link: 'https://example.com/rss-object-tech',
            isoDate: '2026-03-01T00:00:00Z',
            categories: [{ term: 'Tech' }, { _: 'Innovation' }],
          },
          {
            title: 'RSS Object Sports',
            link: 'https://example.com/rss-object-sports',
            isoDate: '2026-03-01T00:00:00Z',
            categories: [{ term: 'Sports' }],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('RSS Object Tech');
    });
  });

  describe('categoryFilter未設定時の後方互換', () => {
    it('全記事が通過すること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            isoDate: '2026-03-01T00:00:00Z',
          },
          {
            title: 'Article 2',
            link: 'https://example.com/2',
            isoDate: '2026-03-01T00:00:00Z',
          },
          {
            title: 'Article 3',
            link: 'https://example.com/3',
            isoDate: '2026-03-01T00:00:00Z',
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource('Meta Engineering'),
        createMockConfig({ categoryFilter: undefined })
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(3);
    });
  });

  describe('フィルタ後0件時のwarnログ', () => {
    it('フィルタ後0件の場合にwarnログが出力されること', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({
        items: [
          {
            title: 'Sports Article',
            link: 'https://example.com/sports',
            isoDate: '2026-03-01T00:00:00Z',
            category: [createAtomCategory('Sports')],
          },
        ],
      });

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'Business Insider',
          filter: ['Tech', 'AI'],
        }),
        'カテゴリフィルタ後の記事が0件'
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('parseURLがエラーをスローした場合、エラーが適切に処理されること', async () => {
      const mockParseURL = jest.fn().mockRejectedValue(new Error('Network error'));

      MockedParser.mockImplementation(() => ({
        parseURL: mockParseURL,
      }) as unknown as Parser);

      const fetcher = new GenericForeignRssFetcher(
        createMockSource(),
        createMockConfig()
      );

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });
  });
});
