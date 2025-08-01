import { GitHubBlogFetcher } from '@/lib/fetchers/github-blog';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';

// RSS Parserをモック
jest.mock('rss-parser');

describe('GitHubBlogFetcher', () => {
  let fetcher: GitHubBlogFetcher;
  let mockSource: Source;
  let mockParser: jest.Mocked<Parser>;

  beforeEach(() => {
    // モックソースの作成
    mockSource = {
      id: 'test-id',
      name: 'GitHub Blog',
      type: 'RSS',
      url: 'https://github.blog/',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Parserのモックを設定
    mockParser = {
      parseURL: jest.fn(),
    } as any;

    (Parser as jest.MockedClass<typeof Parser>).mockImplementation(() => mockParser);

    fetcher = new GitHubBlogFetcher(mockSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and parse RSS feed correctly', async () => {
    // モックRSSフィードデータ
    const mockFeedData = {
      items: [
        {
          title: 'New GitHub Feature Released',
          link: 'https://github.blog/2025-01-01-new-feature',
          pubDate: '2025-01-01T00:00:00Z',
          content: '<p>Article content here</p>',
          contentSnippet: 'Article content here',
          guid: 'guid-1',
          categories: ['Product'],
          author: 'GitHub Team',
          enclosure: {
            url: 'https://github.blog/image.jpg',
            type: 'image/jpeg',
          },
        },
        {
          title: 'GitHub Security Update',
          link: 'https://github.blog/2025-01-02-security-update',
          pubDate: '2025-01-02T00:00:00Z',
          content: '<p>Security update details</p>',
          contentSnippet: 'Security update details',
          guid: 'guid-2',
          categories: ['Security'],
          author: 'Security Team',
        },
      ],
    };

    mockParser.parseURL.mockResolvedValue(mockFeedData as any);

    // フェッチャーを実行
    const result = await fetcher.fetch();

    // 結果の検証
    expect(result.articles).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    // 最初の記事の検証
    const firstArticle = result.articles[0];
    expect(firstArticle.title).toBe('New GitHub Feature Released');
    expect(firstArticle.url).toBe('https://github.blog/2025-01-01-new-feature/');
    expect(firstArticle.summary).toBeUndefined(); // 要約はgenerate-summaries.tsで生成
    expect(firstArticle.content).toBe('<p>Article content here</p>');
    expect(firstArticle.thumbnail).toBe('https://github.blog/image.jpg');
    expect(firstArticle.publishedAt).toEqual(new Date('2025-01-01T00:00:00Z'));
    expect(firstArticle.sourceId).toBe('test-id');
    expect(firstArticle.qualityScore).toBe(0);
    expect(firstArticle.bookmarks).toBe(0);
    expect(firstArticle.userVotes).toBe(0);
    expect(firstArticle.tags).toEqual([]);

    // Parser.parseURLが正しいURLで呼ばれたことを確認
    expect(mockParser.parseURL).toHaveBeenCalledWith('https://github.blog/feed/');
  });

  it('should handle empty feed', async () => {
    mockParser.parseURL.mockResolvedValue({ items: [] } as any);

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle invalid items gracefully', async () => {
    const mockFeedData = {
      items: [
        {
          // titleがない不正なアイテム
          link: 'https://github.blog/invalid',
          pubDate: '2025-01-01T00:00:00Z',
        },
        {
          title: 'Valid Article',
          link: 'https://github.blog/valid',
          pubDate: '2025-01-01T00:00:00Z',
        },
        {
          // linkがない不正なアイテム
          title: 'No Link Article',
          pubDate: '2025-01-01T00:00:00Z',
        },
      ],
    };

    mockParser.parseURL.mockResolvedValue(mockFeedData as any);

    const result = await fetcher.fetch();

    // 有効な記事のみが含まれることを確認
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('Valid Article');
  });

  it('should limit articles to 30', async () => {
    // 40件の記事を作成
    const items = Array.from({ length: 40 }, (_, i) => ({
      title: `Article ${i + 1}`,
      link: `https://github.blog/article-${i + 1}`,
      pubDate: new Date(2025, 0, i + 1).toISOString(),
    }));

    mockParser.parseURL.mockResolvedValue({ items } as any);

    const result = await fetcher.fetch();

    // 最大30件に制限されていることを確認
    expect(result.articles).toHaveLength(30);
  });

  it('should handle parser errors', async () => {
    const error = new Error('Failed to fetch RSS feed');
    mockParser.parseURL.mockRejectedValue(error);

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe(error);
  });

  it('should skip disabled sources', async () => {
    // ソースを無効化
    mockSource.enabled = false;
    fetcher = new GitHubBlogFetcher(mockSource);

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(mockParser.parseURL).not.toHaveBeenCalled();
  });
});