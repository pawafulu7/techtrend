import { PAPER_SOURCE_IDS } from '@/lib/constants/source-categories';

// 論文のソース（arXiv AI・Hugging Face Papers）は、ホームとリーダーの一覧・ソースの絞り込みから
// 外し、論文ページ（/papers）に出す。ホーム・リーダー・論文ページで同じ判定を使う

const PAPER_SOURCE_ID_SET = new Set(PAPER_SOURCE_IDS);

/** API の excludeSources・sources に渡す、論文のソース ID（カンマ区切り） */
export const PAPER_SOURCE_IDS_PARAM = PAPER_SOURCE_IDS.join(',');

export function isPaperSourceId(sourceId: string): boolean {
  return PAPER_SOURCE_ID_SET.has(sourceId);
}

/** ソースの一覧から論文のソースを除く */
export function withoutPaperSources<S extends { id: string }>(
  sources: S[]
): S[] {
  return sources.filter((source) => !isPaperSourceId(source.id));
}

/** グループ分けしたソースから論文のソースを除き、空になったグループも除く */
export function withoutPaperSourceGroups<
  G extends { sources: { id: string }[] },
>(groups: G[]): G[] {
  return groups
    .map((group) => ({ ...group, sources: withoutPaperSources(group.sources) }))
    .filter((group) => group.sources.length > 0);
}

/**
 * URL の sources（カンマ区切りのソース ID、または all / none）から論文のソースを除く。
 * 残りが無ければ undefined（sources を送らない＝全選択）。
 *
 * 画面は論文のソースを無効な ID として全選択に戻す（app/(home)/page.tsx）ので、取得もそれに
 * そろえる。そのまま送ると、同じ ID を excludeSources でも外すので一覧が 0 件になる。
 */
export function withoutPaperSourceIds(
  sourcesParam: string
): string | undefined {
  if (sourcesParam === 'all' || sourcesParam === 'none') return sourcesParam;
  const ids = sourcesParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && !isPaperSourceId(id));
  return ids.length > 0 ? ids.join(',') : undefined;
}
