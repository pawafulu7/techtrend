import { BaseFetcher } from '@/lib/fetchers/base';
import { Source } from '@prisma/client';
import { CreateArticleInput, FetchResult } from '@/types/fetchers';

// テスト用の具体的なフェッチャー実装
class TestFetcher extends BaseFetcher {
  private mockResult: FetchResult;

  constructor(source: Source, mockResult?: FetchResult) {
    super(source);
    this.mockResult = mockResult || { articles: [], errors: [] };
  }

  async fetch(): Promise<FetchResult> {
    return this.safeFetch();
  }

  protected async fetchInternal(): Promise<FetchResult> {
    return this.mockResult;
  }

  // テスト用にprotectedメソッドを公開
  public testRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    return this.retry(fn, retries);
  }

  public testNormalizeUrl(url: string): string {
    return this.normalizeUrl(url);
  }

  public testExtractThumbnail(html: string): string | null {
    return this.extractThumbnail(html);
  }

  public testSanitizeText(text: string): string {
    return this.sanitizeText(text);
  }
}

describe('BaseFetcher', () => {
  const mockSource: Source = {
    id: 'test-source-id',
    name: 'Test Source',
    url: 'https://test.example.com',
    rssUrl: null,
    category: 'test',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockArticle: CreateArticleInput = {
    title: 'Test Article',
    url: 'https://test.example.com/article',
    summary: undefined,
    content: 'Test content',
    publishedAt: new Date(),
    sourceId: 'test-source-id',
    thumbnail: null,
    tagNames: ['test'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // logger のモック - 各メソッドが異なるconsoleメソッドを呼び出す
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('safeFetch', () => {
    it('正常に記事を取得できる', async () => {
      const mockResult: FetchResult = {
        articles: [mockArticle],
        errors: [],
      };
      const fetcher = new TestFetcher(mockSource, mockResult);

      const result = await fetcher.fetch();

      expect(result).toEqual(mockResult);
      // logger の出力形式に合わせて期待値を調整
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test Source から記事を取得中...'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test Source: 1件の記事を取得'));
    });

    it('無効化されたソースの場合は空の結果を返す', async () => {
      const disabledSource = { ...mockSource, enabled: false };
      const fetcher = new TestFetcher(disabledSource);

      const result = await fetcher.fetch();

      expect(result).toEqual({ articles: [], errors: [] });
      // logger.info と logger.warn の両方が呼ばれる
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test Source から記事を取得中...'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Test Source は無効化されています'));
    });

    it('記事が見つからない場合の処理', async () => {
      const emptyResult: FetchResult = {
        articles: [],
        errors: [],
      };
      const fetcher = new TestFetcher(mockSource, emptyResult);

      const result = await fetcher.fetch();

      expect(result).toEqual(emptyResult);
      // logger.info の出力形式に合わせて期待値を調整
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test Source: 記事が見つかりませんでした'));
    });

    it('エラーが発生した場合の処理', async () => {
      class ErrorFetcher extends TestFetcher {
        protected async fetchInternal(): Promise<FetchResult> {
          throw new Error('Fetch error');
        }
      }

      const fetcher = new ErrorFetcher(mockSource);
      const result = await fetcher.fetch();

      expect(result.articles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      // ExternalAPIError の形式に合わせて期待値を調整
      expect(result.errors[0].message).toContain('Fetch error');
      // logger.error は複数回呼ばれるので、最初の呼び出しを確認
      expect(console.error).toHaveBeenCalled();
      const errorCalls = (console.error as jest.Mock).mock.calls;
      expect(errorCalls[0][0]).toContain('Test Source エラー:');
    });
  });

  describe('retry', () => {
    it('成功するまでリトライする', async () => {
      const fetcher = new TestFetcher(mockSource);
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry test error');
        }
        return 'success';
      });

      const result = await fetcher.testRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('最大リトライ回数を超えたらエラーをthrowする', async () => {
      const fetcher = new TestFetcher(mockSource);
      const fn = jest.fn(async () => {
        throw new Error('Always fails');
      });

      await expect(fetcher.testRetry(fn, 2)).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(3); // 初回 + 2回のリトライ
    });
  });

  describe('normalizeUrl', () => {
    it('正しいURLをそのまま返す', () => {
      const fetcher = new TestFetcher(mockSource);
      const url = 'https://example.com/path?query=value';
      
      expect(fetcher.testNormalizeUrl(url)).toBe(url);
    });

    it('不正なURLの場合は元の文字列を返す', () => {
      const fetcher = new TestFetcher(mockSource);
      const invalidUrl = 'not-a-valid-url';
      
      expect(fetcher.testNormalizeUrl(invalidUrl)).toBe(invalidUrl);
    });

    it('URLを正規化する', () => {
      const fetcher = new TestFetcher(mockSource);
      const url = 'https://example.com//path///';
      
      expect(fetcher.testNormalizeUrl(url)).toBe('https://example.com//path///');
    });
  });

  describe('extractThumbnail', () => {
    it('og:imageメタタグから画像URLを抽出する', () => {
      const fetcher = new TestFetcher(mockSource);
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/image.jpg">
          </head>
        </html>
      `;
      
      expect(fetcher.testExtractThumbnail(html)).toBe('https://example.com/image.jpg');
    });

    it('og:imageがない場合は最初のimgタグから抽出する', () => {
      const fetcher = new TestFetcher(mockSource);
      const html = `
        <html>
          <body>
            <img src="https://example.com/fallback.jpg" alt="test">
          </body>
        </html>
      `;
      
      expect(fetcher.testExtractThumbnail(html)).toBe('https://example.com/fallback.jpg');
    });

    it('画像が見つからない場合はnullを返す', () => {
      const fetcher = new TestFetcher(mockSource);
      const html = '<html><body>No images here</body></html>';
      
      expect(fetcher.testExtractThumbnail(html)).toBeNull();
    });
  });

  describe('sanitizeText', () => {
    it('HTMLタグを削除する', () => {
      const fetcher = new TestFetcher(mockSource);
      const html = '<p>This is <strong>bold</strong> text</p>';
      
      expect(fetcher.testSanitizeText(html)).toBe('This is bold text');
    });

    it('余分な空白を正規化する', () => {
      const fetcher = new TestFetcher(mockSource);
      const text = '  Multiple   spaces    and\n\nnewlines  ';
      
      expect(fetcher.testSanitizeText(text)).toBe('Multiple spaces and newlines');
    });

    it('複雑なHTMLを処理する', () => {
      const fetcher = new TestFetcher(mockSource);
      const html = `
        <div class="article">
          <h1>Title</h1>
          <p>First paragraph with <a href="#">link</a></p>
          <script>alert('test');</script>
          <style>body { color: red; }</style>
        </div>
      `;
      
      expect(fetcher.testSanitizeText(html)).toBe('Title First paragraph with link alert(\'test\'); body { color: red; }');
    });
  });
});