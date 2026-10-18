/**
 * ニュースレターの記事の URL に当てる除外の規則と、追跡パラメータの除去。
 *
 * Cooperpress の記事リンクは自誌の転送 URL なので、転送を解決した後の URL に当てる
 * （解決の前に当てると、自誌の除外で全部落ちる）。
 */

import { TRACKING_PARAMS } from '@/lib/utils/url/url-normalizer';

const SOCIAL_HOSTS = [
  'x.com',
  'twitter.com',
  'bsky.app',
  'mastodon.social',
  'fosstodon.org',
  'hachyderm.io',
  'reddit.com',
  'news.ycombinator.com',
  'lobste.rs',
];
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com'];
const EVENT_HOSTS = ['luma.com', 'lu.ma', 'eventbrite.com'];

export type LinkFilterResult =
  { ok: true; url: string } | { ok: false; reason: string };

function matchesHost(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );
}

/**
 * 保存してよい記事の URL なら、追跡パラメータと # を落とした URL を返す。
 * www・末尾のスラッシュは落とさない（HN などは記事の URL をそのまま保存していて、
 * 完全一致の重複判定がずれるため）
 */
export function filterArticleUrl(
  rawUrl: string,
  ownHosts: readonly string[]
): LinkFilterResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid-url' };
  }
  // 資格情報を含む URL は保存しない（ログや記事の URL に資格情報が出る）
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  // トップページだけを除く。`/?p=123` のようにクエリで記事を指す URL は残す（追跡パラメータだけのクエリはトップページ）
  const cleaned = stripTracking(url);
  if ((url.pathname === '/' || url.pathname === '') && new URL(cleaned).search === '')
    return { ok: false, reason: 'homepage' };
  if (matchesHost(hostname, ownHosts)) return { ok: false, reason: 'own-site' };
  if (matchesHost(hostname, SOCIAL_HOSTS))
    return { ok: false, reason: 'social' };
  if (matchesHost(hostname, VIDEO_HOSTS)) return { ok: false, reason: 'video' };
  if (matchesHost(hostname, EVENT_HOSTS)) return { ok: false, reason: 'event' };
  // 利用規約が自動取得を禁じている
  if (matchesHost(hostname, ['linkedin.com']))
    return { ok: false, reason: 'linkedin' };
  // 有料記事を個人に共有するためのリンク
  if (
    matchesHost(hostname, ['lwn.net']) &&
    url.pathname.startsWith('/SubscriberLink/')
  ) {
    return { ok: false, reason: 'subscriber-link' };
  }

  return { ok: true, url: cleaned };
}

/**
 * 追跡パラメータと # だけを落とす。追跡パラメータが無ければクエリには触らない
 * （searchParams を書き換えるとクエリ全体が書き直され、`?a` が `?a=` になるなど URL が変わるため）
 */
export function stripTracking(url: URL): string {
  const cleaned = new URL(url.toString());
  const present = TRACKING_PARAMS.filter((param) =>
    cleaned.searchParams.has(param)
  );
  for (const param of present) {
    cleaned.searchParams.delete(param);
  }
  cleaned.hash = '';
  return cleaned.toString();
}
