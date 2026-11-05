/**
 * 取得の最後の結果を覚える仕組み（fetch-trace.ts）と、safe-redirect.ts からの記録のテスト
 *
 * dns.promises.lookup は jest.setup.node.js でグローバルにモックされている。fetch はテストごとに差し替える。
 */

import dns from 'dns';
import { isIP } from 'net';
import {
  fetchErrorOutcome,
  recordFetchOutcome,
  traceFetches,
} from '../fetch-trace';
import {
  fetchWithValidatedRedirects,
  readTextWithLimit,
} from '../safe-redirect';

const mockLookup = dns.promises.lookup as jest.Mock;

function fakeResponse(
  status: number,
  headers: Record<string, string> = {},
  body?: string
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: null,
    text: async () => body ?? '',
  } as unknown as Response;
}

describe('traceFetches', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockLookup.mockReset();
    mockLookup.mockImplementation(async (hostname: string) => {
      if (isIP(hostname))
        return [{ address: hostname, family: isIP(hostname) }];
      if (hostname === 'internal.example')
        return [{ address: '10.0.0.5', family: 4 }];
      return [{ address: '203.0.113.10', family: 4 }];
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('最後の応答のステータスを返す（途中の転送は記録しない）', async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(302, { location: 'https://example.com/b' })
      )
      .mockResolvedValueOnce(fakeResponse(404));

    const { value, lastFetch } = await traceFetches(async () => {
      const { response } = await fetchWithValidatedRedirects(
        'https://example.com/a'
      );
      return response.status;
    });

    expect(value).toBe(404);
    expect(lastFetch).toEqual({
      kind: 'response',
      status: 404,
      challenge: false,
    });
  });

  it('Cloudflare の確認ページ（cf-mitigated: challenge）を見分ける', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(403, { 'cf-mitigated': 'challenge' })
    );

    const { lastFetch } = await traceFetches(() =>
      fetchWithValidatedRedirects('https://example.com/a')
    );

    expect(lastFetch).toEqual({
      kind: 'response',
      status: 403,
      challenge: true,
    });
  });

  it('同じ処理の中で取り直したら、後の結果で上書きする', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(429))
      .mockResolvedValueOnce(fakeResponse(200));

    const { lastFetch } = await traceFetches(async () => {
      await fetchWithValidatedRedirects('https://example.com/a');
      await fetchWithValidatedRedirects('https://example.com/a');
    });

    expect(lastFetch).toEqual({
      kind: 'response',
      status: 200,
      challenge: false,
    });
  });

  it('SSRF の検証で拒否したら SSRF_REJECTED（問い合わせはしない）', async () => {
    const { lastFetch } = await traceFetches(async () => {
      await fetchWithValidatedRedirects('https://internal.example/a').catch(
        () => null
      );
    });

    expect(lastFetch).toEqual({
      kind: 'error',
      code: 'SSRF_REJECTED',
      cause: 'forbidden_ip_range',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('名前解決できないホストは SSRF の拒否ではなく NETWORK', async () => {
    mockLookup.mockRejectedValueOnce(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    );

    const { lastFetch } = await traceFetches(async () => {
      await fetchWithValidatedRedirects('https://gone.example/a').catch(() => null);
    });

    expect(lastFetch).toEqual({
      kind: 'error',
      code: 'NETWORK',
      cause: 'dns_resolution_failed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fn が投げた例外はそのまま投げる', async () => {
    await expect(
      traceFetches(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('転送の数が上限を超えたら REDIRECT_REJECTED', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(302, { location: 'https://example.com/loop' })
    );

    const { lastFetch } = await traceFetches(async () => {
      await fetchWithValidatedRedirects('https://example.com/a', {
        maxRedirects: 1,
      }).catch(() => null);
    });

    expect(lastFetch).toEqual({ kind: 'error', code: 'REDIRECT_REJECTED' });
  });

  it('接続の失敗は NETWORK と原因のコード（メッセージは持たない）', async () => {
    fetchMock.mockRejectedValueOnce(
      new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } })
    );

    const { lastFetch } = await traceFetches(async () => {
      await fetchWithValidatedRedirects('https://example.com/a').catch(
        () => null
      );
    });

    expect(lastFetch).toEqual({
      kind: 'error',
      code: 'NETWORK',
      cause: 'ENOTFOUND',
    });
  });

  it('本文が上限を超えたら、200 の応答の後でも TOO_LARGE', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(200, {}, 'x'.repeat(11)));

    const { lastFetch } = await traceFetches(async () => {
      const { response } = await fetchWithValidatedRedirects(
        'https://example.com/a'
      );
      await readTextWithLimit(response, 10).catch(() => null);
    });

    expect(lastFetch).toEqual({ kind: 'error', code: 'TOO_LARGE' });
  });

  it('本文の受信中に失敗したら、200 の応答の記録を上書きする', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(
          new TypeError('terminated', { cause: { code: 'UND_ERR_BODY_TIMEOUT' } })
        );
      },
    });
    fetchMock.mockResolvedValueOnce(
      Object.assign(fakeResponse(200), { body: stream })
    );

    const { lastFetch } = await traceFetches(async () => {
      const { response } = await fetchWithValidatedRedirects('https://example.com/a');
      await readTextWithLimit(response).catch(() => null);
    });

    expect(lastFetch).toEqual({
      kind: 'error',
      code: 'TIMEOUT',
      cause: 'UND_ERR_BODY_TIMEOUT',
    });
  });

  it('並行に動く traceFetches の記録は混ざらない', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slow = traceFetches(async () => {
      recordFetchOutcome({ kind: 'response', status: 404, challenge: false });
      await gate;
    });
    const fast = traceFetches(async () => {
      recordFetchOutcome({ kind: 'response', status: 200, challenge: false });
    });

    expect((await fast).lastFetch).toMatchObject({ status: 200 });
    release();
    expect((await slow).lastFetch).toMatchObject({ status: 404 });
  });

  it('traceFetches の外の取得は、動いている別の traceFetches に記録しない', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse(500));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const traced = traceFetches(async () => {
      await gate;
    });
    await fetchWithValidatedRedirects('https://example.com/a');
    release();

    expect((await traced).lastFetch).toBeUndefined();
  });
});

describe('fetchErrorOutcome', () => {
  it.each([
    ['AbortError', new DOMException('aborted', 'AbortError')],
    ['TimeoutError', new DOMException('timed out', 'TimeoutError')],
  ])('%s は TIMEOUT', (_name, error) => {
    expect(fetchErrorOutcome(error)).toEqual({
      kind: 'error',
      code: 'TIMEOUT',
    });
  });

  it('undici の時間切れ（cause.code）は TIMEOUT と原因のコード', () => {
    expect(
      fetchErrorOutcome(
        new TypeError('fetch failed', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })
      )
    ).toEqual({ kind: 'error', code: 'TIMEOUT', cause: 'UND_ERR_HEADERS_TIMEOUT' });
  });

  it('Error でない中断の理由でも落ちずに NETWORK', () => {
    expect(fetchErrorOutcome('reason')).toEqual({
      kind: 'error',
      code: 'NETWORK',
    });
    expect(fetchErrorOutcome(undefined)).toEqual({
      kind: 'error',
      code: 'NETWORK',
    });
  });
});
