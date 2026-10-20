/**
 * 既存記事を、同じ URL を取ったソースに付け替えるか。
 *
 * 付け替えは「本来の出し手のソース」（企業ブログなど）へ移すためのもの。はてなブックマーク・
 * ニュースレター・Hacker News などのリンクを集めるソースは、記事を選んだだけで出し手ではないので、
 * そこから移し、そこへは移さない。
 * そこへ移すと、そのソースを enabled=false にしたとき、以前からあった記事まで一覧から消える
 * （enabledSourceWhere は source.enabled=true を要求する）。そこが先に保存した記事も、後から
 * 出し手のソースが取れば移す（同じ理由で、止めたときに消えないように。取得の順で記事のソースが
 * 変わらないようにもなる）。
 * 付け替えの書き込みは scripts/scheduled/utils/source-transfer.ts。
 */
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';
import { CURATED_NEWSLETTER_SOURCE_IDS } from '@/lib/fetchers/curated-newsletter/configs';

/** 外部の記事へのリンクを集めるソース（出し手ではない） */
const LINK_AGGREGATOR_SOURCE_IDS: ReadonlySet<string> = new Set([
  'hacker_news_202508', // Hacker News
  'lobsters', // Lobsters
  'techmeme', // Techmeme
]);

/** 記事を選んだだけで、出し手ではないソース */
function isNonPublisherSource(sourceId: string): boolean {
  return (
    sourceId === HATENA_SOURCE_ID ||
    CURATED_NEWSLETTER_SOURCE_IDS.has(sourceId) ||
    LINK_AGGREGATOR_SOURCE_IDS.has(sourceId)
  );
}

export function shouldTransferSource(existingSourceId: string, sourceId: string): boolean {
  return isNonPublisherSource(existingSourceId) && !isNonPublisherSource(sourceId);
}
