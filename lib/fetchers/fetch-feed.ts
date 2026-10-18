/**
 * フィードの XML を取ってくる。rss-parser の parseURL の代わりに使う。
 *
 * parseURL は Accept-Encoding を送らず、展開もしない。サーバーが頼んでいない gzip で返すと
 * 「Non-whitespace before first tag」で解析に失敗する（DeepMind Blog で観測）。fetch は展開する。
 * 時間の上限は本文の受信まで効かせる（fetchWithTimeout は応答のヘッダが届いた時点で
 * タイマーを解除するため、本文の受信が止まると上限が効かない）。
 *
 * フィードの URL は設定の固定値で、利用者が持ち込めないので SSRF の検証は付けない。
 */

import { readTextWithLimit } from '@/lib/utils/url/safe-redirect';

export const DEFAULT_FEED_TIMEOUT_MS = 30_000;

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

  const response = await fetch(url, { headers: FEED_HEADERS, signal });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Feed request failed: HTTP ${response.status} for ${url}`);
  }
  return readTextWithLimit(response);
}
