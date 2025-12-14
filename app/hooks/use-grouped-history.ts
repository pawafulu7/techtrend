'use client';

import { useMemo } from 'react';
import {
  groupHistoryByDate,
  type GroupedHistoryItem,
  type DateGroupingOptions,
} from '@/lib/utils/date-grouping';

/**
 * 閲覧履歴アイテムの型
 */
interface HistoryViewItem {
  viewedAt: string;
  article: {
    id: number;
    viewId: number;
    title: string;
    translatedTitle?: string | null;
    summary: string | null;
    url: string;
    publishedAt: string;
    source: {
      id: number;
      name: string;
    };
    companyName?: string | null;
    tags?: Array<{
      id: number;
      name: string;
    }>;
    contentLength?: number;
    content?: string | null;
  };
}

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
