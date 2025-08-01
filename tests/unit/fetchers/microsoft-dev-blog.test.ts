import { MicrosoftDevBlogFetcher } from '@/lib/fetchers/microsoft-dev-blog';
import { Source } from '@prisma/client';
import Parser from 'rss-parser';

// RSS Parserをモック
jest.mock('rss-parser');

describe('MicrosoftDevBlogFetcher', () => {
  let fetcher: MicrosoftDevBlogFetcher;
  let mockSource: Source;
  let mockParser: jest.Mocked<Parser>;

  beforeEach(() => {
    // モックソースの作成
    mockSource = {
      id: 'test-id',
      name: 'Microsoft Developer Blog',
      type: 'RSS',
      url: 'https://devblogs.microsoft.com/',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Parserのモックを設定
    mockParser = {
      parseURL: jest.fn(),
    } as any;

    (Parser as jest.MockedClass<typeof Parser>).mockImplementation(() => mockParser);

    fetcher = new MicrosoftDevBlogFetcher(mockSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and combine multiple RSS feeds', async () => {
    // 各フィードのモックデータ
    const dotnetFeed = {
      items: [
        {
          title: '.NET 9 Released',
          link: 'https://devblogs.microsoft.com/dotnet/net-9-released',
          pubDate: '2025-01-03T00:00:00Z',
          content: '<p>.NET 9 features</p>',
        },
      ],
    };

    const typescriptFeed = {
      items: [
        {
          title: 'TypeScript 5.9 Beta',
          link: 'https://devblogs.microsoft.com/typescript/ts-5-9-beta',
          pubDate: '2025-01-02T00:00:00Z',
          content: '<p>TypeScript features</p>',
        },
      ],
    };

    const vsFeed = {
      items: [
        {
          title: 'Visual Studio 2025',
          link: 'https://devblogs.microsoft.com/visualstudio/vs-2025',
          pubDate: '2025-01-01T00:00:00Z',
          content: '<p>VS features</p>',
        },
      ],
    };

    // 各フィードURLに対して異なるレスポンスを返す
    mockParser.parseURL.mockImplementation((url: string) => {
      if (url.includes('dotnet')) return Promise.resolve(dotnetFeed as any);
      if (url.includes('typescript')) return Promise.resolve(typescriptFeed as any);
      if (url.includes('visualstudio')) return Promise.resolve(vsFeed as any);
      return Promise.resolve({ items: [] } as any);
    });

    // フェッチャーを実行
    const result = await fetcher.fetch();

    // 結果の検証
    expect(result.articles).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    // parseURLが3回呼ばれたことを確認
    expect(mockParser.parseURL).toHaveBeenCalledTimes(3);
    expect(mockParser.parseURL).toHaveBeenCalledWith('https://devblogs.microsoft.com/dotnet/feed/');
    expect(mockParser.parseURL).toHaveBeenCalledWith('https://devblogs.microsoft.com/typescript/feed/');
    expect(mockParser.parseURL).toHaveBeenCalledWith('https://devblogs.microsoft.com/visualstudio/feed/');

    // 記事がプレフィックス付きで保存されていることを確認
    const titles = result.articles.map(a => a.title);
    expect(titles).toContain('[.NET] .NET 9 Released');
    expect(titles).toContain('[TypeScript] TypeScript 5.9 Beta');
    expect(titles).toContain('[Visual Studio] Visual Studio 2025');

    // 日付順にソートされていることを確認（最新が最初）
    expect(result.articles[0].title).toBe('[.NET] .NET 9 Released');
    expect(result.articles[1].title).toBe('[TypeScript] TypeScript 5.9 Beta');
    expect(result.articles[2].title).toBe('[Visual Studio] Visual Studio 2025');
  });

  it('should handle duplicate URLs across feeds', async () => {
    const duplicateUrl = 'https://devblogs.microsoft.com/common-article';
    
    // 複数のフィードに同じURLの記事がある
    const feedData = {
      items: [
        {
          title: 'Common Article',
          link: duplicateUrl,
          pubDate: '2025-01-01T00:00:00Z',
        },
      ],
    };

    mockParser.parseURL.mockResolvedValue(feedData as any);

    const result = await fetcher.fetch();

    // 重複が除外されて1件のみになることを確認
    expect(result.articles).toHaveLength(1);
  });

  it('should continue processing if one feed fails', async () => {
    const error = new Error('Feed fetch failed');
    
    // TypeScriptフィードでエラー、他は成功
    mockParser.parseURL.mockImplementation((url: string) => {
      if (url.includes('typescript')) return Promise.reject(error);
      return Promise.resolve({
        items: [{
          title: 'Article',
          link: `https://devblogs.microsoft.com/${url.includes('dotnet') ? 'dotnet' : 'vs'}/article`,
          pubDate: '2025-01-01T00:00:00Z',
        }],
      } as any);
    });

    const result = await fetcher.fetch();

    // エラーがあっても他のフィードの記事は取得できることを確認
    expect(result.articles).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe(error);
  });

  it('should limit total articles to 30', async () => {
    // 各フィードから15件ずつ、計45件の記事
    const feedData = {
      items: Array.from({ length: 15 }, (_, i) => ({
        title: `Article ${i + 1}`,
        link: `https://devblogs.microsoft.com/article-${i + 1}`,
        pubDate: new Date(2025, 0, 15 - i).toISOString(), // 日付を降順に
      })),
    };

    mockParser.parseURL.mockResolvedValue(feedData as any);

    const result = await fetcher.fetch();

    // 最大30件に制限されていることを確認
    expect(result.articles).toHaveLength(30);
  });

  it('should handle empty feeds', async () => {
    mockParser.parseURL.mockResolvedValue({ items: [] } as any);

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should normalize URLs with trailing slash', async () => {
    const feedData = {
      items: [{
        title: 'Test Article',
        link: 'https://devblogs.microsoft.com/dotnet/article', // スラッシュなし
        pubDate: '2025-01-01T00:00:00Z',
      }],
    };

    mockParser.parseURL.mockResolvedValue(feedData as any);

    const result = await fetcher.fetch();

    // URLが正規化されていることを確認
    expect(result.articles[0].url).toBe('https://devblogs.microsoft.com/dotnet/article');
  });
});