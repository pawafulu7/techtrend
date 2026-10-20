/**
 * フィードの XML を取ってくる。rss-parser の parseURL の代わりに使い、取った XML は parseString で
 * 解析する（parseURL は eslint.config.mjs で禁止している。lint の対象外の scripts は除く）。
 *
 * parseURL は転送先を検証せず、https から http への転送もたどる。また Accept-Encoding を送らず、
 * 展開もしない。サーバーが頼んでいない gzip で返すと「Non-whitespace before first tag」で解析に
 * 失敗する（DeepMind Blog で観測）。fetch は展開する。
 * 時間の上限は本文の受信まで効かせる（fetchWithTimeout は応答のヘッダが届いた時点で
 * タイマーを解除するため、本文の受信が止まると上限が効かない）。
 *
 * フィードの URL は設定の固定値だが、提供元が返す転送先は固定ではないので、転送の各段を SSRF の検証に通し、
 * https だけをたどる（lib/utils/url/safe-redirect.ts）。
 */

import { fetchWithValidatedRedirects, readTextWithLimit } from '@/lib/utils/url/safe-redirect';

export const DEFAULT_FEED_TIMEOUT_MS = 30_000;

/**
 * 本文の大きさの上限。記事ページの既定（5MB）より大きくする。2026-10 の時点で、Vercel Blog の Atom は
 * 3.8MB（記事が増えるほど大きくなる）、arXiv の3分野をまとめた RSS は 3.2MB（日によって件数が変わる）だった
 */
export const FEED_MAX_BODY_BYTES = 20 * 1024 * 1024;

const FEED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TechTrend/1.0; +https://techtrend.example.com/bot)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
};

export interface FetchFeedOptions {
  /** 本文の受信までを含む時間の上限。既定 30 秒 */
  timeoutMs?: number;
  /** 呼び出し側の中断（締め切りなど） */
  signal?: AbortSignal;
}

export async function fetchFeedXml(url: string, options: FetchFeedOptions = {}): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FEED_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  // フィードの URL は固定でも、提供元が返す転送先は固定ではないので、各段を検証し、https だけをたどる
  const { response } = await fetchWithValidatedRedirects(url, {
    headers: FEED_HEADERS,
    signal,
    httpsOnly: true,
    context: { fetcher: 'fetchFeedXml' },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Feed request failed: HTTP ${response.status} for ${url}`);
  }
  return readTextWithLimit(
    response,
    FEED_MAX_BODY_BYTES,
    encodingOf(response.headers?.get('content-type'))
  );
}

/**
 * Content-Type の charset（parseURL も見ていた）。無いときと、TextDecoder が知らない名前のときは UTF-8
 */
function encodingOf(contentType: string | null | undefined): string {
  const label = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '')?.[1];
  if (!label) return 'utf-8';
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return 'utf-8';
  }
}
