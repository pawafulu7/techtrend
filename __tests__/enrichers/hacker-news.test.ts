/**
 * HackerNewsEnricher テスト
 */

import { HackerNewsEnricher } from '../../lib/enrichers/hacker-news';

// GenericContentEnricherをモック
jest.mock('../../lib/enrichers/generic', () => ({
  GenericContentEnricher: jest.fn().mockImplementation(() => ({
    enrich: jest.fn().mockResolvedValue(null),
    canHandle: jest.fn().mockReturnValue(true),
  })),
}));

// loggerをモック
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HackerNewsEnricher', () => {
  let enricher: HackerNewsEnricher;
  const originalFetch = global.fetch;

  beforeEach(() => {
    enricher = new HackerNewsEnricher();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // fetchをモック化するためのヘルパー
  const mockFetch = (responses: Array<{ html: string; status?: number }>) => {
    const fetchMock = jest.fn();
    for (const resp of responses) {
      const status = resp.status ?? 200;
      fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        text: jest.fn().mockResolvedValue(resp.html),
      } as any);
    }
    global.fetch = fetchMock;
    return fetchMock;
  };

  const mockFetchSingle = (html: string, status = 200) => {
    return mockFetch([{ html, status }]);
  };

  describe('extractRepoRootUrl', () => {
    it('GitHub blob URLからリポジトリルートURLを抽出できること', () => {
      // privateメソッドなのでanyでアクセス
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://github.com/owner/repo/blob/main/README.md')).toBe(
        'https://github.com/owner/repo'
      );
    });

    it('GitHub tree URLからリポジトリルートURLを抽出できること', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://github.com/owner/repo/tree/main/src')).toBe(
        'https://github.com/owner/repo'
      );
    });

    it('GitHub discussions URLからリポジトリルートURLを抽出できること', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(
        extract('https://github.com/owner/repo/discussions/123')
      ).toBe('https://github.com/owner/repo');
    });

    it('リポジトリルートURLの場合はそのまま返すこと', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://github.com/owner/repo')).toBe(
        'https://github.com/owner/repo'
      );
    });

    it('GitHub以外のURLではnullを返すこと', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://example.com/owner/repo')).toBeNull();
      expect(extract('https://gitlab.com/owner/repo')).toBeNull();
    });

    it('GitHubのユーザーページ（リポ名なし）ではnullを返すこと', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://github.com/owner')).toBeNull();
      expect(extract('https://github.com/')).toBeNull();
    });

    it('www.github.comのURLからリポジトリルートURLを抽出できること', () => {
      const extract = (enricher as any).extractRepoRootUrl.bind(enricher);

      expect(extract('https://www.github.com/owner/repo/blob/main/README.md')).toBe(
        'https://www.github.com/owner/repo'
      );
      expect(extract('https://www.github.com/owner/repo')).toBe(
        'https://www.github.com/owner/repo'
      );
    });
  });

  describe('GitHub OGP fallback', () => {
    it('blobページにog:imageがない場合、リポジトリルートのog:imageを取得すること', async () => {
      const blobHtml = `
        <html>
          <head>
            <meta name="description" content="A great repository" />
          </head>
          <body>
            <article itemprop="text">${'A'.repeat(200)}</article>
          </body>
        </html>
      `;

      const repoRootHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://opengraph.githubassets.com/repo-image.png" />
          </head>
          <body></body>
        </html>
      `;

      const fetchMock = mockFetch([
        { html: blobHtml },
        { html: repoRootHtml },
      ]);

      const result = await enricher.enrich(
        'https://github.com/owner/repo/blob/main/README.md'
      );

      expect(result).not.toBeNull();
      expect(result?.thumbnail).toBe(
        'https://opengraph.githubassets.com/repo-image.png'
      );
      // 2回目のfetchはrepo rootに対するもの
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://github.com/owner/repo');
    });

    it('blobページにog:imageがある場合、リポジトリルートへのフォールバックをしないこと', async () => {
      const blobHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://opengraph.githubassets.com/blob-image.png" />
          </head>
          <body>
            <article itemprop="text">${'B'.repeat(200)}</article>
          </body>
        </html>
      `;

      const fetchMock = mockFetchSingle(blobHtml);

      const result = await enricher.enrich(
        'https://github.com/owner/repo/blob/main/file.ts'
      );

      expect(result).not.toBeNull();
      expect(result?.thumbnail).toBe(
        'https://opengraph.githubassets.com/blob-image.png'
      );
      // fetchは1回のみ（repo rootへのフォールバックなし）
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('リポジトリルートURLの場合、自分自身に再リクエストしないこと', async () => {
      const repoHtml = `
        <html>
          <head></head>
          <body>
            <article itemprop="text">${'C'.repeat(200)}</article>
          </body>
        </html>
      `;

      const fetchMock = mockFetchSingle(repoHtml);

      const result = await enricher.enrich('https://github.com/owner/repo');

      // og:imageなし、repo root === url なので再リクエストしない
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).not.toBeNull();
      expect(result?.thumbnail).toBeUndefined();
    });

    it('リポジトリルートのfetchが失敗しても、エラーにならないこと', async () => {
      const blobHtml = `
        <html>
          <head></head>
          <body>
            <article itemprop="text">${'D'.repeat(200)}</article>
          </body>
        </html>
      `;

      const fetchMock = jest.fn();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(blobHtml),
      } as any);
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      global.fetch = fetchMock;

      const result = await enricher.enrich(
        'https://github.com/owner/repo/blob/main/file.ts'
      );

      expect(result).not.toBeNull();
      expect(result?.content).toBeTruthy();
      expect(result?.thumbnail).toBeUndefined();
    });
  });

  describe('Thumbnail preservation on fallback', () => {
    it('content < 100 + og:image取得済み + GenericEnricher null -> {content: null, thumbnail}', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/thumb.jpg" />
          </head>
          <body>
            <main>Short</main>
          </body>
        </html>
      `;

      mockFetchSingle(html);

      // GenericEnricherはnullを返す（デフォルトモック）
      const result = await enricher.enrich('https://example.com/article');

      expect(result).not.toBeNull();
      expect(result?.content).toBeNull();
      expect(result?.thumbnail).toBe('https://example.com/thumb.jpg');
    });

    it('content < 100 + thumbnail無し + GenericEnricher null -> null', async () => {
      const html = `
        <html>
          <head></head>
          <body>
            <main>Short</main>
          </body>
        </html>
      `;

      mockFetchSingle(html);

      const result = await enricher.enrich('https://example.com/article');

      expect(result).toBeNull();
    });

    it('content < 100 + GenericEnricherが結果を返す -> GenericEnricherの結果を使用', async () => {
      const html = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/thumb.jpg" />
          </head>
          <body>
            <main>Short</main>
          </body>
        </html>
      `;

      mockFetchSingle(html);

      // GenericEnricherが結果を返すようにモック
      const genericEnricher = (enricher as any).genericEnricher;
      genericEnricher.enrich.mockResolvedValueOnce({
        content: 'Generic enriched content that is long enough',
        thumbnail: 'https://example.com/generic-thumb.jpg',
      });

      const result = await enricher.enrich('https://example.com/article');

      expect(result).not.toBeNull();
      expect(result?.content).toBe(
        'Generic enriched content that is long enough'
      );
      expect(result?.thumbnail).toBe('https://example.com/generic-thumb.jpg');
    });

    it('GitHub URL + content < 100 + repo root og:image取得済み + GenericEnricher null -> {content: null, thumbnail}', async () => {
      const blobHtml = `
        <html>
          <head></head>
          <body>
            <article itemprop="text">Short</article>
          </body>
        </html>
      `;

      const repoRootHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://opengraph.githubassets.com/repo-image.png" />
          </head>
          <body></body>
        </html>
      `;

      mockFetch([{ html: blobHtml }, { html: repoRootHtml }]);

      const result = await enricher.enrich(
        'https://github.com/owner/repo/blob/main/file.ts'
      );

      expect(result).not.toBeNull();
      expect(result?.content).toBeNull();
      expect(result?.thumbnail).toBe(
        'https://opengraph.githubassets.com/repo-image.png'
      );
    });
  });

  describe('canHandle', () => {
    it('サポートされたドメインを正しく判定できること', () => {
      expect(
        enricher.canHandle('https://github.com/owner/repo')
      ).toBe(true);
      expect(enricher.canHandle('https://arxiv.org/abs/1234.5678')).toBe(
        true
      );
      expect(
        enricher.canHandle('https://research.google.com/article')
      ).toBe(true);
    });

    it('サポートされていないドメインを拒否すること', () => {
      expect(enricher.canHandle('https://example.com/article')).toBe(false);
      expect(enricher.canHandle('https://reddit.com/post')).toBe(false);
    });

    it('不正なURLを安全に処理すること', () => {
      expect(enricher.canHandle('not-a-url')).toBe(false);
      expect(enricher.canHandle('')).toBe(false);
    });
  });
});
