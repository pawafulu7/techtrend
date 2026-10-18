/**
 * 既存記事を、同じ URL を取ったソースに付け替えるか。
 *
 * 付け替えは「本来の出し手のソース」（企業ブログなど）へ移すためのもの。はてなブックマークと
 * ニュースレターは記事を選んだだけで出し手ではないので、そこから移し、そこへは移さない。
 * ニュースレターへ移すと、ニュースレターを enabled=false にしたとき、以前からあった記事まで
 * 一覧から消える（enabledSourceWhere は source.enabled=true を要求する）。ニュースレターが
 * 先に保存した記事も、後から別のソースが取れば移す（同じ理由で、止めたときに消えないように）。
 */
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';
import { CURATED_NEWSLETTER_SOURCE_IDS } from '@/lib/fetchers/curated-newsletter/configs';

function isCuratingSource(sourceId: string): boolean {
  return sourceId === HATENA_SOURCE_ID || CURATED_NEWSLETTER_SOURCE_IDS.has(sourceId);
}

export function shouldTransferSource(existingSourceId: string, sourceId: string): boolean {
  return isCuratingSource(existingSourceId) && !isCuratingSource(sourceId);
}
