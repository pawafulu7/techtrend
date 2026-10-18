/**
 * はてなブックマーク経由で入った既存記事を、同じ URL を取ったソースに付け替えるか。
 *
 * 付け替えは「本来の出し手のソース」（企業ブログなど）へ移すためのもの。ニュースレターは
 * 記事を選んだだけで出し手ではない。付け替えると、ニュースレターを enabled=false にしたとき、
 * 以前からあった記事まで一覧から消える（enabledSourceWhere は source.enabled=true を要求する）。
 */
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';
import { CURATED_NEWSLETTER_SOURCE_IDS } from '@/lib/fetchers/curated-newsletter/configs';

export function shouldTransferFromHatena(existingSourceId: string, sourceId: string): boolean {
  return (
    existingSourceId === HATENA_SOURCE_ID &&
    sourceId !== HATENA_SOURCE_ID &&
    !CURATED_NEWSLETTER_SOURCE_IDS.has(sourceId)
  );
}
