import { HatenaExtendedFetcher } from '@/lib/fetchers/hatena-extended';
import { BaseFetcher } from '@/lib/fetchers/base';
import { Source } from '@prisma/client';

// Mock rss-parser
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: mockParseURL,
  }));
});

// Mock BaseFetcher's retry to avoid waiting for retryDelay
// eslint-disable-next-line @typescript-eslint/no-explicit-any
jest.spyOn(BaseFetcher.prototype as any, 'retry')
  .mockImplementation(async (fn: () => Promise<unknown>) => fn());

describe('HatenaExtendedFetcher - thumbnail logic', () => {
  const mockSource: Source = {
    id: 'hatena_extended_test',
    name: 'はてなブックマーク',
    type: 'RSS',
    url: 'https://b.hatena.ne.jp/hotentry/it.rss',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * Helper to create a minimal RSS feed item that passes the tech-keyword filter.
   * The title includes "TypeScript" to ensure isTechArticle returns true.
   */
  function createFeedItem(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      title: 'TypeScriptの新機能について',
      link: 'https://example.com/article/1',
      pubDate: '2026-02-17T00:00:00.000Z',
      description: 'TypeScript記事の説明',
      categories: ['TypeScript'],
      ...overrides,
    };
  }

  /**
   * Helper to build a mock feed response containing the given items.
   * Each call to parseURL will resolve items from the corresponding index.
   */
  function setupMockFeeds(items: Record<string, unknown>[]) {
    // HatenaExtendedFetcher calls parseURL for 3 RSS URLs.
    // Return items only on the first call, empty on subsequent to avoid duplicates.
    mockParseURL
      .mockResolvedValueOnce({ items })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hatena:imageurlが存在する場合、thumbnailに設定される', async () => {
    const item = createFeedItem({
      hatenaImageUrl: 'https://cdn.example.com/thumb.jpg',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].thumbnail).toBe(
      'https://cdn.example.com/thumb.jpg'
    );
  });

  it('hatena:imageurlが存在しない場合、thumbnailはundefined', async () => {
    const item = createFeedItem({
      link: 'https://example.com/article/no-thumb',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].thumbnail).toBeUndefined();
  });

  it('hatena:imageurlがなくURLがzenn.devの場合、generateZennThumbnailでフォールバック', async () => {
    const item = createFeedItem({
      title: 'TypeScript入門ガイド',
      link: 'https://zenn.dev/testuser/articles/test-article-123',
      hatenaImageUrl: undefined,
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    // generateZennThumbnail produces a Cloudinary URL for valid Zenn article URLs
    expect(result.articles[0].thumbnail).toContain(
      'res.cloudinary.com/zenn/image/upload'
    );
    expect(result.articles[0].thumbnail).toContain('testuser');
  });

  it('hatena:imageurlがありURLがzenn.devの場合、hatena:imageurlが優先される', async () => {
    const item = createFeedItem({
      title: 'TypeScript入門ガイド',
      link: 'https://zenn.dev/testuser/articles/test-article-456',
      hatenaImageUrl: 'https://cdn.example.com/hatena-thumb.jpg',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].thumbnail).toBe(
      'https://cdn.example.com/hatena-thumb.jpg'
    );
  });

  it('hatena:imageurlが空文字の場合、Zenn URLならフォールバックに落ちる', async () => {
    const item = createFeedItem({
      title: 'TypeScript最新情報',
      link: 'https://zenn.dev/testuser/articles/empty-imageurl-test',
      hatenaImageUrl: '',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    // Empty string is falsy, so it should fall through to Zenn thumbnail generation
    expect(result.articles[0].thumbnail).toContain(
      'res.cloudinary.com/zenn/image/upload'
    );
  });

  it('hatena:imageurlがjavascript:スキームの場合、thumbnailはundefined', async () => {
    const item = createFeedItem({
      link: 'https://example.com/article/xss-test',
      hatenaImageUrl: 'javascript:alert(1)',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].thumbnail).toBeUndefined();
  });

  it('hatena:imageurlが不正なURL(foo)の場合、thumbnailはundefined', async () => {
    const item = createFeedItem({
      link: 'https://example.com/article/invalid-url',
      hatenaImageUrl: 'foo',
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].thumbnail).toBeUndefined();
  });

  it('URLにzenn.dev文字列を含むがドメインがZennではない場合、フォールバックしない', async () => {
    const item = createFeedItem({
      link: 'https://example.com/?ref=zenn.dev',
      hatenaImageUrl: undefined,
    });
    setupMockFeeds([item]);

    const fetcher = new HatenaExtendedFetcher(mockSource);
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    // isUrlFromDomain checks the hostname, not the full URL string
    expect(result.articles[0].thumbnail).toBeUndefined();
  });
});
