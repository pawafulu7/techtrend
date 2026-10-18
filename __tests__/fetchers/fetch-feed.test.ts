/**
 * fetchFeedXml と、それを使う DeepMindBlogFetcher のテスト
 *
 * rss-parser の parseURL は、頼んでいない gzip の応答を解析できないことがある（DeepMind Blog で観測）。
 * fetch で取ってから parseString で解析する。時間の上限は本文の受信まで効かせる。
 */

import { fetchFeedXml } from '@/lib/fetchers/fetch-feed';
import { DeepMindBlogFetcher } from '@/lib/fetchers/deepmind-blog';
import { ResponseTooLargeError, InvalidRedirectError } from '@/lib/utils/url/safe-redirect';
import { SsrfGuardError } from '@/lib/utils/url/ssrf-guard';
import dns from 'dns';
import type { Source } from '@/lib/prisma-exports';

function streamOf(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

function feedResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    body,
    text: async () => '',
  } as unknown as Response;
}

describe('fetchFeedXml', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    (dns.promises.lookup as jest.Mock).mockReset();
    (dns.promises.lookup as jest.Mock).mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('本文を文字列で返し、signal を付けて取る', async () => {
    const fetchMock = jest.fn(async () => feedResponse(streamOf('<rss></rss>')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml')).resolves.toBe('<rss></rss>');
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('本文の受信が止まったら、時間の上限で止まる', async () => {
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) =>
      feedResponse(
        new ReadableStream<Uint8Array>({
          start(c) {
            // fetch の本文と同じく、signal の中断でストリームをエラーにする
            init?.signal?.addEventListener('abort', () =>
              c.error(new DOMException('The operation was aborted', 'TimeoutError'))
            );
          },
          pull() {
            return new Promise<void>(() => undefined);
          },
        })
      )
    ) as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml', { timeoutMs: 50 })).rejects.toThrow(
      'aborted'
    );
  });

  it('フィードの提供元が内部の IP へ転送したら、その先に問い合わせない', async () => {
    (dns.promises.lookup as jest.Mock).mockImplementation(async (hostname: string) =>
      hostname === 'internal.example'
        ? [{ address: '169.254.169.254', family: 4 }]
        : [{ address: '203.0.113.10', family: 4 }]
    );
    const fetchMock = jest.fn(async () => ({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'https://internal.example/latest/meta-data' }),
      body: null,
    }));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml')).rejects.toBeInstanceOf(SsrfGuardError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('https から http への転送はたどらない', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 301,
      ok: false,
      headers: new Headers({ location: 'http://feed.example/rss.xml' }),
      body: null,
    }));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml')).rejects.toBeInstanceOf(InvalidRedirectError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP のエラーは例外にする', async () => {
    global.fetch = jest.fn(async () => feedResponse(null, 404)) as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml')).rejects.toThrow('HTTP 404');
  });

  it('本文が上限を超えたら読まない', async () => {
    global.fetch = jest.fn(async () => ({
      ...feedResponse(streamOf('x')),
      headers: new Headers({ 'content-length': String(6 * 1024 * 1024) }),
    })) as unknown as typeof global.fetch;

    await expect(fetchFeedXml('https://feed.example/rss.xml')).rejects.toBeInstanceOf(
      ResponseTooLargeError
    );
  });
});

describe('DeepMindBlogFetcher', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    (dns.promises.lookup as jest.Mock).mockReset();
    (dns.promises.lookup as jest.Mock).mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetch で取ったフィードを解析して記事にする', async () => {
    const pubDate = new Date().toUTCString();
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>DeepMind</title>
      <item><title>Gemini: a new large language model for AI research</title>
      <link>https://deepmind.google/discover/blog/gemini-llm/</link>
      <pubDate>${pubDate}</pubDate>
      <description>Our new LLM and machine learning research on AI agents.</description></item>
      </channel></rss>`;
    const fetchMock = jest.fn(async () => feedResponse(streamOf(xml)));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const source = { id: 'deepmind_blog', name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml' } as unknown as Source;
    const { articles, errors } = await new DeepMindBlogFetcher(source).fetch();

    expect(errors).toEqual([]);
    expect(articles.map((a) => a.url)).toEqual(['https://deepmind.google/discover/blog/gemini-llm/']);
    expect(articles[0].sourceId).toBe('deepmind_blog');
    expect(fetchMock).toHaveBeenCalledWith('https://deepmind.google/blog/rss.xml', expect.any(Object));
  });
});
