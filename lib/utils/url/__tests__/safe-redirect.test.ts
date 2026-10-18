/**
 * safe-redirect のユニットテスト
 *
 * dns.promises.lookup は jest.setup.node.js でグローバルにモックされている。ここではホスト名ごとに
 * 解決先を返すよう上書きし、転送の途中で内部 IP に移るケースを作る。fetch はテストごとに差し替える。
 */

import dns from 'dns';
import { isIP } from 'net';
import { SsrfGuardError } from '../ssrf-guard';
import {
  fetchWithValidatedRedirects,
  readTextWithLimit,
  isNonRetryableFetchError,
  RedirectLimitError,
  InvalidRedirectError,
  ResponseTooLargeError,
} from '../safe-redirect';

const mockLookup = dns.promises.lookup as jest.Mock;

interface FakeResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

function fakeResponse({
  status = 200,
  headers = {},
  body,
}: FakeResponseInit = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: body ?? null,
    text: async () => (typeof body === 'string' ? body : ''),
  } as unknown as Response;
}

function redirect(location: string, status = 302) {
  return fakeResponse({ status, headers: { location } });
}

/** 指定したバイト数のチャンクを、読まれた分だけ作るストリーム */
function lazyStream(chunkBytes: number, maxChunks: number) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= maxChunks) {
        controller.close();
        return;
      }
      pulled++;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x61));
    },
  });
  return { stream, pulledCount: () => pulled };
}

describe('fetchWithValidatedRedirects', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockLookup.mockReset();
    mockLookup.mockImplementation(async (hostname: string) => {
      // 実際の dns.lookup と同じく、IP リテラルはそのまま返す
      if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
      if (hostname === 'internal.example')
        return [{ address: '10.0.0.5', family: 4 }];
      if (hostname === 'metadata.example')
        return [{ address: '169.254.169.254', family: 4 }];
      return [{ address: '203.0.113.10', family: 4 }];
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('転送が無ければ、その応答と URL を返す。fetch は redirect: manual で呼ぶ', async () => {
    const ok = fakeResponse({ body: 'hello' });
    fetchMock.mockResolvedValueOnce(ok);

    const result = await fetchWithValidatedRedirects('https://a.example/post', {
      headers: { 'User-Agent': 'test' },
    });

    expect(result.response).toBe(ok);
    expect(result.finalUrl).toBe('https://a.example/post');
    expect(fetchMock).toHaveBeenCalledWith('https://a.example/post', {
      method: 'GET',
      headers: { 'User-Agent': 'test' },
      signal: undefined,
      redirect: 'manual',
    });
  });

  it('相対の Location を、いまの URL を基準にたどる', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('/new/path?x=1', 301))
      .mockResolvedValueOnce(fakeResponse());

    const result = await fetchWithValidatedRedirects('https://a.example/old');

    expect(result.finalUrl).toBe('https://a.example/new/path?x=1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://a.example/new/path?x=1',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('複数段をたどり、各段の URL を検証する', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://b.example/1', 301))
      .mockResolvedValueOnce(redirect('https://c.example/2', 308))
      .mockResolvedValueOnce(fakeResponse());

    const result = await fetchWithValidatedRedirects('https://a.example/');

    expect(result.finalUrl).toBe('https://c.example/2');
    expect(mockLookup.mock.calls.map((c) => c[0])).toEqual([
      'a.example',
      'b.example',
      'c.example',
    ]);
  });

  it('HEAD は転送の後も HEAD のまま', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://b.example/', 303))
      .mockResolvedValueOnce(fakeResponse());

    await fetchWithValidatedRedirects('https://a.example/', { method: 'HEAD' });

    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual([
      'HEAD',
      'HEAD',
    ]);
  });

  it.each([
    ['プライベート IP', 'https://internal.example/'],
    ['クラウドのメタデータ', 'https://metadata.example/latest/meta-data'],
    ['IP リテラル', 'http://127.0.0.1:8080/'],
  ])(
    '途中で%sへ転送されたら SsrfGuardError を投げ、そこへは問い合わせない',
    async (_, target) => {
      fetchMock.mockResolvedValueOnce(redirect(target));

      await expect(
        fetchWithValidatedRedirects('https://a.example/')
      ).rejects.toBeInstanceOf(SsrfGuardError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('最初の URL が拒否されたら fetch を呼ばない', async () => {
    await expect(
      fetchWithValidatedRedirects('https://internal.example/')
    ).rejects.toBeInstanceOf(SsrfGuardError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('転送の数が上限を超えたら RedirectLimitError', async () => {
    fetchMock.mockImplementation(async () =>
      redirect('https://a.example/loop')
    );

    await expect(
      fetchWithValidatedRedirects('https://a.example/', { maxRedirects: 2 })
    ).rejects.toBeInstanceOf(RedirectLimitError);
    // 最初の1回 + 転送2回で3回問い合わせ、3回目の転送で止まる
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['URL として壊れている', 'http://['],
    ['資格情報を含む', 'https://user:pass@b.example/'],
    ['file: スキーム', 'file:///etc/passwd'],
  ])('Location が%sときは InvalidRedirectError', async (_, location) => {
    fetchMock.mockResolvedValueOnce(redirect(location));

    await expect(
      fetchWithValidatedRedirects('https://a.example/')
    ).rejects.toBeInstanceOf(InvalidRedirectError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([300, 304])(
    '%d は Location があってもたどらずに返す',
    async (status) => {
      const res = fakeResponse({
        status,
        headers: { location: 'https://b.example/' },
      });
      fetchMock.mockResolvedValueOnce(res);

      const result = await fetchWithValidatedRedirects('https://a.example/');

      expect(result.response).toBe(res);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('Location の無い 302 は、たどらずに返す', async () => {
    const res = fakeResponse({ status: 302 });
    fetchMock.mockResolvedValueOnce(res);

    const result = await fetchWithValidatedRedirects('https://a.example/');

    expect(result.response).toBe(res);
  });

  it('別のオリジンへ移るとき authorization・cookie などを落とし、同じオリジンでは保つ', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('/same'))
      .mockResolvedValueOnce(redirect('https://other.example/'))
      .mockResolvedValueOnce(fakeResponse());

    await fetchWithValidatedRedirects('https://a.example/', {
      headers: {
        'User-Agent': 'test',
        Authorization: 'Bearer secret',
        Cookie: 'a=b',
        'Proxy-Authorization': 'x',
      },
    });

    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      'User-Agent': 'test',
      Authorization: 'Bearer secret',
      Cookie: 'a=b',
      'Proxy-Authorization': 'x',
    });
    expect(fetchMock.mock.calls[2][1].headers).toEqual({
      'User-Agent': 'test',
    });
  });

  it('資格情報を含む URL は、名前解決も問い合わせもせずに InvalidRedirectError', async () => {
    await expect(
      fetchWithValidatedRedirects('https://user:secret@a.example/')
    ).rejects.toBeInstanceOf(InvalidRedirectError);
    expect(mockLookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('名前解決が終わらなくても、signal で中断されたら待たずに抜ける', async () => {
    mockLookup.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const fetching = fetchWithValidatedRedirects('https://slow-dns.example/', {
      signal: controller.signal,
    });
    controller.abort(new DOMException('aborted', 'AbortError'));

    await expect(fetching).rejects.toThrow('aborted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signal を全段に渡す', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(redirect('https://b.example/'))
      .mockResolvedValueOnce(fakeResponse());

    await fetchWithValidatedRedirects('https://a.example/', {
      signal: controller.signal,
    });

    expect(
      fetchMock.mock.calls.every((c) => c[1].signal === controller.signal)
    ).toBe(true);
  });
});

describe('readTextWithLimit', () => {
  it('ストリームの本文を UTF-8 で読む', async () => {
    const bytes = new TextEncoder().encode('こんにちは');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 4)); // 文字の途中で切れても正しく読む
        controller.enqueue(bytes.slice(4));
        controller.close();
      },
    });

    await expect(
      readTextWithLimit(fakeResponse({ body: stream }))
    ).resolves.toBe('こんにちは');
  });

  it('Content-Length が上限を超えるときは読まずに ResponseTooLargeError', async () => {
    const { stream, pulledCount } = lazyStream(10, 10);

    await expect(
      readTextWithLimit(
        fakeResponse({ body: stream, headers: { 'content-length': '1000' } }),
        100
      )
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(pulledCount()).toBeLessThanOrEqual(1);
  });

  it('展開後の本文が上限を超えたら、そこで読むのをやめる（gzip の爆弾を想定）', async () => {
    // Content-Length は圧縮後の小さい値でも、展開後のストリームは大きい
    const { stream, pulledCount } = lazyStream(64 * 1024, 10_000);

    await expect(
      readTextWithLimit(
        fakeResponse({ body: stream, headers: { 'content-length': '2048' } }),
        256 * 1024
      )
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(pulledCount()).toBeLessThan(10);
  });

  it('本文の受信中に signal で中断されたら、読み込みも止まる', async () => {
    const controller = new AbortController();
    // fetch の本文と同じく、signal の中断でストリームをエラーにする
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller.signal.addEventListener('abort', () =>
          c.error(new DOMException('aborted', 'AbortError'))
        );
      },
      pull() {
        return new Promise<void>(() => undefined);
      },
    });
    const reading = readTextWithLimit(fakeResponse({ body: stream }));
    controller.abort();

    await expect(reading).rejects.toThrow('aborted');
  });

  it('本文がストリームでない（テストのモック）ときは text() で読み、上限を確かめる', async () => {
    await expect(
      readTextWithLimit(fakeResponse({ body: 'abc' }), 10)
    ).resolves.toBe('abc');
    await expect(
      readTextWithLimit(fakeResponse({ body: 'x'.repeat(11) }), 10)
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});

describe('isNonRetryableFetchError', () => {
  it('検証・転送・本文の上限の失敗は再試行しない', () => {
    expect(
      isNonRetryableFetchError(new SsrfGuardError('x', 'forbidden_ip_range'))
    ).toBe(true);
    expect(isNonRetryableFetchError(new RedirectLimitError('x'))).toBe(true);
    expect(isNonRetryableFetchError(new InvalidRedirectError('x'))).toBe(true);
    expect(isNonRetryableFetchError(new ResponseTooLargeError('x'))).toBe(true);
  });

  it('ネットワークの失敗やタイムアウトは再試行してよい', () => {
    expect(isNonRetryableFetchError(new Error('ECONNRESET'))).toBe(false);
    expect(
      isNonRetryableFetchError(new DOMException('aborted', 'AbortError'))
    ).toBe(false);
  });
});
