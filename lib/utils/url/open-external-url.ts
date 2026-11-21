import { isHttpUrl } from '@/lib/utils/url/url-validator';

/**
 * 記事の元ページなど、外部の URL を新しいタブで開く
 *
 * http(s) 以外（`javascript:`・`data:` など）は開かない。記事の URL は配信元のフィードから来るので、
 * window.open にそのまま渡さない（href と違い、React は window.open の URL を書き換えない）。
 * 収集の時点でも http(s) 以外の記事は保存していない（scripts/scheduled/collect-feeds.ts）。
 */
export function openExternalUrl(url: string): void {
  if (!isHttpUrl(url)) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
