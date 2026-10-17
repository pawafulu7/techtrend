/**
 * HuggingFacePapersFetcher（Hugging Face の API から Daily Papers を取る）のテスト
 */
import { HuggingFacePapersFetcher } from '@/lib/fetchers/ai/huggingface-papers';
import { Source } from '@/lib/prisma-exports';

jest.mock('@/lib/logger', () => {
  const noop = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  return { __esModule: true, logger: noop, default: noop };
});

const NOW = new Date('2026-10-17T09:00:00.000Z');
const DAYS = ['2026-10-16', '2026-10-15', '2026-10-14'];

const source: Source = {
  id: 'hf-papers',
  name: 'Hugging Face Papers',
  url: 'https://huggingface.co/papers',
  type: 'RSS',
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function paper(
  id: string,
  overrides: { upvotes?: number; publishedAt?: string; title?: string; summary?: string } = {}
) {
  return {
    title: overrides.title ?? `Paper ${id}`,
    thumbnail: `https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/${id}.png`,
    paper: {
      id,
      title: overrides.title ?? `Paper ${id}`,
      summary: overrides.summary ?? `Abstract of ${id}.`,
      publishedAt: overrides.publishedAt ?? '2026-10-14T00:00:00.000Z',
      upvotes: overrides.upvotes ?? 1,
      authors: [{ name: 'Alice' }, { name: 'Bob' }],
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

/** 日付（とページ）ごとの応答を返す fetch のモック */
function mockFetchByDay(pages: Record<string, unknown[] | Error | number>) {
  const fetchMock = jest.fn(async (input: string) => {
    const url = new URL(input);
    const key = `${url.searchParams.get('date')}#${url.searchParams.get('p')}`;
    const page = pages[key] ?? pages[url.searchParams.get('date') ?? ''] ?? [];
    if (page instanceof Error) throw page;
    if (typeof page === 'number') return jsonResponse({ error: 'x' }, page);
    return jsonResponse(page);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('HuggingFacePapersFetcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createFetcher() {
    return new HuggingFacePapersFetcher(source, () => NOW);
  }

  it('前日から3日分の一覧を、limit=100・p=0 で取る', async () => {
    const fetchMock = mockFetchByDay({});

    await createFetcher().fetch();

    const urls = fetchMock.mock.calls.map(([input]) => new URL(input));
    expect(urls.map((u) => u.searchParams.get('date')).sort()).toEqual([...DAYS].sort());
    for (const url of urls) {
      expect(url.origin + url.pathname).toBe('https://huggingface.co/api/daily_papers');
      expect(url.searchParams.get('limit')).toBe('100');
      expect(url.searchParams.get('p')).toBe('0');
    }
  });

  it('論文を arXiv の URL・要旨入りの本文・サムネイルで返す', async () => {
    mockFetchByDay({ '2026-10-16': [paper('2610.21185')] });

    const result = await createFetcher().fetch();

    expect(result.errors).toEqual([]);
    expect(result.articles).toHaveLength(1);
    const [article] = result.articles;
    expect(article).toEqual(
      expect.objectContaining({
        title: 'Paper 2610.21185',
        url: 'https://arxiv.org/abs/2610.21185',
        sourceId: 'hf-papers',
        publishedAt: new Date('2026-10-14T00:00:00.000Z'),
        thumbnail:
          'https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/2610.21185.png',
      })
    );
    expect(article.content).toContain('Abstract of 2610.21185.');
    expect(article.content).toContain('Authors: Alice, Bob');
    expect(article.content).toContain('arXiv ID: 2610.21185');
  });

  it('公開が 7 日より古い論文を除いてから、upvotes の多い順に日ごと 30 件までにする', async () => {
    const old = paper('2609.00001', {
      upvotes: 9999,
      publishedAt: '2026-10-01T00:00:00.000Z',
    });
    const fresh = Array.from({ length: 35 }, (_, i) =>
      paper(`2610.${String(10000 + i)}`, { upvotes: i })
    );
    mockFetchByDay({ '2026-10-16': [old, ...fresh] });

    const result = await createFetcher().fetch();

    expect(result.articles).toHaveLength(30);
    const urls = result.articles.map((a) => a.url);
    expect(urls).not.toContain('https://arxiv.org/abs/2609.00001');
    expect(urls[0]).toBe('https://arxiv.org/abs/2610.10034');
    expect(urls).not.toContain('https://arxiv.org/abs/2610.10004');
  });

  it('1ページが 100 件ちょうどなら次のページも取る', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) =>
      paper(`2610.${String(20000 + i)}`, { upvotes: 1 })
    );
    const top = paper('2610.29999', { upvotes: 500 });
    const fetchMock = mockFetchByDay({
      '2026-10-16#0': firstPage,
      '2026-10-16#1': [top],
    });

    const result = await createFetcher().fetch();

    const pagesFor16 = fetchMock.mock.calls
      .map(([input]) => new URL(input))
      .filter((u) => u.searchParams.get('date') === '2026-10-16')
      .map((u) => u.searchParams.get('p'));
    expect(pagesFor16).toEqual(['0', '1']);
    expect(result.articles[0].url).toBe('https://arxiv.org/abs/2610.29999');
  });

  it('論文の無い日（週末など）は、記事もエラーも無い', async () => {
    mockFetchByDay({});

    const result = await createFetcher().fetch();

    expect(result).toEqual({ articles: [], errors: [] });
  });

  it('1日分が失敗しても他の日の論文は返し、失敗はエラーに積む', async () => {
    mockFetchByDay({
      '2026-10-16': [paper('2610.21185')],
      '2026-10-15': 503,
      '2026-10-14': new Error('The operation was aborted due to timeout'),
    });

    const result = await createFetcher().fetch();

    expect(result.articles.map((a) => a.url)).toEqual([
      'https://arxiv.org/abs/2610.21185',
    ]);
    expect(result.errors.map((e) => e.message)).toEqual([
      'Hugging Face Daily Papers取得エラー (2026-10-15): Status code 503',
      'Hugging Face Daily Papers取得エラー (2026-10-14): The operation was aborted due to timeout',
    ]);
  });

  it('応答が配列でなければ、その日をエラーにする', async () => {
    mockFetchByDay({ '2026-10-16': { error: 'unexpected' } as unknown as unknown[] });

    const result = await createFetcher().fetch();

    expect(result.errors.map((e) => e.message)).toEqual([
      'Hugging Face Daily Papers取得エラー (2026-10-16): 応答が配列ではない',
    ]);
  });

  it('必須の項目が無い論文は飛ばし、件数をエラーに積む', async () => {
    const broken = [
      { paper: { id: 'not-an-arxiv-id', title: 'x', summary: 'y', publishedAt: '2026-10-14T00:00:00Z' } },
      { paper: { id: '2610.11111', title: 'No abstract', summary: '', publishedAt: '2026-10-14T00:00:00Z' } },
      { paper: { id: '2610.22222', title: 'Bad date', summary: 'y', publishedAt: 'not a date' } },
    ];
    mockFetchByDay({ '2026-10-16': [paper('2610.21185'), ...broken] });

    const result = await createFetcher().fetch();

    expect(result.articles.map((a) => a.url)).toEqual([
      'https://arxiv.org/abs/2610.21185',
    ]);
    expect(result.errors.map((e) => e.message)).toEqual([
      'Hugging Face Daily Papers (2026-10-16): 必須の項目が無い論文 3 件を飛ばした',
    ]);
  });

  it('リクエストに期限（AbortSignal）を付ける', async () => {
    const fetchMock = mockFetchByDay({});

    await createFetcher().fetch();

    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
