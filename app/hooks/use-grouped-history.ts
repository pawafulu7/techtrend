'use client';

import { useMemo } from 'react';
import {
  groupHistoryByDate,
  type GroupedHistoryItem,
  type DateGroupingOptions,
} from '@/lib/utils/date-grouping';
import type { HistoryViewItem } from '@/lib/types/history';

/**
 * 閲覧履歴を日付でグループ化するカスタムフック
 *
 * @param views - 閲覧履歴アイテムの配列
 * @param options - グルーピングオプション
 * @returns グループ化された履歴アイテムの配列
 *
 * @example
 * ```tsx
 * function HistoryPage() {
 *   const { data: views } = useHistoryViews();
 *   const groupedHistory = useGroupedHistory(views ?? []);
 *
 *   return (
 *     <div>
 *       {groupedHistory.map((group) => (
 *         <section key={group.key} aria-labelledby={`${group.key}-heading`}>
 *           <h2 id={`${group.key}-heading`}>{group.label}</h2>
 *           <ul>
 *             {group.items.map((item) => (
 *               <li key={item.article.viewId}>
 *                 <HistoryArticleCard article={item.article} viewedAt={item.viewedAt} />
 *               </li>
 *             ))}
 *           </ul>
 *         </section>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useGroupedHistory(
  views: HistoryViewItem[] | null | undefined,
  options?: DateGroupingOptions
): GroupedHistoryItem<HistoryViewItem>[] {
  return useMemo(() => {
    if (!views || views.length === 0) {
      return [];
    }
    return groupHistoryByDate(views, options);
  }, [views, options]);
}
