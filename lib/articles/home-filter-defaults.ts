/**
 * URL に無い一覧の条件（ソース・並び順）を Cookie から補う。
 *
 * ホーム（app/(home)/page.tsx）とリーダー（app/reader/page.tsx）が同じ関数を使う。
 * どちらの画面でソースや並び順を変えても同じ Cookie に書くので（useSourceFilter・SortButtons）、
 * 読む側も同じにしないと、片方だけが前回の条件で開く（Issue #709）。
 */

import {
  getFilterPreferencesFromCookies,
  type FilterPreferences,
} from '@/lib/cookies/filter-preferences-cookie';
import { parseSourceFilterFromCookie } from '@/lib/cookies/source-filter-cookie';

interface CookieStoreLike {
  get: (name: string) => { value: string } | undefined;
}

export interface HomeFilterDefaultsInput {
  /** URL の sources / sourceId / sortBy（同じ名前が複数あるときは先頭） */
  params: { sources?: string; sourceId?: string; sortBy?: string };
  cookieStore: CookieStoreLike;
  /** 一覧に出せるソースの ID。Cookie に残った、消えた・除外したソースを落とすため */
  validSourceIds: ReadonlySet<string>;
}

export interface HomeFilterDefaults {
  filterPreferences: FilterPreferences;
  /** undefined は全選択、空配列は全解除 */
  initialSourceIds: string[] | undefined;
  /** URL に sortBy が無いときの並び順 */
  initialSortBy: string | undefined;
}

export function resolveHomeFilterDefaults({
  params,
  cookieStore,
  validSourceIds,
}: HomeFilterDefaultsInput): HomeFilterDefaults {
  const filterPreferences = getFilterPreferencesFromCookies(cookieStore);

  // Get source filter from URL params first, then fall back to cookie
  let initialSourceIds: string[] | undefined = undefined;
  if (params.sources) {
    // URL has explicit sources parameter - use it
    if (params.sources === 'all') {
      // All sources selected - leave undefined to use default (all)
      initialSourceIds = undefined;
    } else if (params.sources === 'none') {
      // No sources selected
      initialSourceIds = [];
    } else {
      // Specific source IDs
      initialSourceIds = params.sources.split(',').filter((id) => id);
    }
  } else if (!params.sourceId) {
    // No URL params - try filter preferences first, then fall back to old source-filter cookie
    if (filterPreferences.sources !== undefined) {
      // 空配列の場合は、全選択として扱う場合を考慮
      // ただし、明示的な全解除の場合は空配列を維持
      initialSourceIds = filterPreferences.sources;
    } else {
      const oldCookie = parseSourceFilterFromCookie(
        cookieStore.get('source-filter')?.value
      );
      if (oldCookie.length > 0) {
        initialSourceIds = oldCookie;
      }
    }
  }

  // Filter out invalid source IDs (excluded or deleted sources)
  if (initialSourceIds && initialSourceIds.length > 0) {
    const filtered = initialSourceIds.filter((id) => validSourceIds.has(id));
    // If all IDs were invalid, fall back to all sources (undefined)
    initialSourceIds = filtered.length > 0 ? filtered : undefined;
  }

  // Get initial sort order from cookie if no URL params
  const initialSortBy = !params.sortBy ? filterPreferences.sortBy : undefined;

  return { filterPreferences, initialSourceIds, initialSortBy };
}
