'use client';

import { useMemo } from 'react';
import {
  groupHistoryByDate,
  type GroupedHistoryItem,
  type DateGroupingOptions,
} from '@/lib/utils/date-grouping';
import type { FavoriteArticle } from '@/lib/types/favorites';

/**
 * お気に入り記事用のアイテム型（日付グルーピング用）
 * groupHistoryByDate の HasViewedAt 制約に合わせて viewedAt を持つ
 */
interface FavoriteWithViewedAt {
  viewedAt: string | null;
  article: FavoriteArticle;
}

/**
 * お気に入り記事を日付でグループ化するカスタムフック
 *
 * favoritedAt（お気に入り追加日時）を基準にグルーピングします。
 * 閲覧履歴と同じ groupHistoryByDate ユーティリティを再利用しています。
 *
 * @param favorites - お気に入り記事の配列
 * @param options - グルーピングオプション
 * @returns グループ化されたお気に入りアイテムの配列
 *
 * @example
 * ```tsx
 * function FavoritesPage() {
 *   const { allFavorites } = useInfiniteFavorites();
 *   const groupedFavorites = useGroupedFavorites(allFavorites);
 *
 *   return (
 *     <div>
 *       {groupedFavorites.map((group) => (
 *         <section key={group.key} aria-labelledby={`favorite-group-${group.key}-heading`}>
 *           <h2 id={`favorite-group-${group.key}-heading`}>{group.label}</h2>
 *           <div className="grid ...">
 *             {group.items.map((item) => (
 *               <FavoriteArticleCard key={item.article.id} article={item.article} />
 *             ))}
 *           </div>
 *         </section>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useGroupedFavorites(
  favorites: FavoriteArticle[] | null | undefined,
  options?: DateGroupingOptions
): GroupedHistoryItem<FavoriteWithViewedAt>[] {
  return useMemo(() => {
    if (!favorites || favorites.length === 0) {
      return [];
    }

    // favoritedAt を viewedAt にマッピングして groupHistoryByDate を再利用
    const mappedItems: FavoriteWithViewedAt[] = favorites.map((article) => ({
      viewedAt: article.favoritedAt, // favoritedAt を viewedAt として使用
      article,
    }));

    return groupHistoryByDate(mappedItems, options);
  }, [favorites, options]);
}

/**
 * お気に入りグループのID生成（アクセシビリティ用）
 *
 * @param key - グループキー
 * @returns h2要素のid属性値
 */
export function getFavoriteGroupHeadingId(
  key: 'today' | 'yesterday' | 'thisWeek' | 'earlier'
): string {
  return `favorite-group-${key}-heading`;
}
