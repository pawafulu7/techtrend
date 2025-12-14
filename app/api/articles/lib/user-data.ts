/**
 * User-specific data fetching and merging utilities
 *
 * Handles fetching favorites and read status for articles,
 * and merging this data with article results.
 */

import { createLoaders } from '@/lib/dataloader';
import { MetricsCollector, withDbTiming } from '@/lib/metrics/performance';
import type { UserSpecificArticleData, ArticleUserOverlay } from './types';

/**
 * Fetch user-specific data (favorites, read status) for a list of articles
 * Uses DataLoader for efficient batching
 *
 * @param userId - User ID to fetch data for
 * @param articleIds - List of article IDs to fetch data for
 * @param metrics - Metrics collector for performance tracking
 * @param options - Optional configuration
 * @param options.bypassFavoriteL1 - When true, bypasses L1 cache for favorite data
 * @returns User-specific article data including favorites and read status
 */
export async function fetchUserSpecificData(
  userId: string,
  articleIds: string[],
  metrics: MetricsCollector,
  options?: { bypassFavoriteL1?: boolean }
): Promise<UserSpecificArticleData> {
  if (!userId || articleIds.length === 0) {
    return {
      favoritedArticleIds: new Set<string>(),
      readArticleIds: new Set<string>(),
    };
  }

  // Create DataLoader instances for this request
  const loaders = createLoaders(
    { userId },
    { favorite: { bypassL1: options?.bypassFavoriteL1 === true } }
  );

  if (!loaders.favorite || !loaders.view) {
    return {
      favoritedArticleIds: new Set<string>(),
      readArticleIds: new Set<string>(),
    };
  }

  // Use DataLoader to batch fetch user-specific data
  const [favoriteStatuses, viewStatuses] = await Promise.all([
    withDbTiming(metrics, () => loaders.favorite!.loadMany(articleIds), 'db_query_favorite'),
    withDbTiming(metrics, () => loaders.view!.loadMany(articleIds), 'db_query_view'),
  ]);

  const favoritedArticleIds = new Set<string>();
  const readArticleIds = new Set<string>();

  // Process favorite statuses
  favoriteStatuses.forEach((status) => {
    if (
      status &&
      typeof status === 'object' &&
      'isFavorited' in status &&
      status.isFavorited
    ) {
      favoritedArticleIds.add(status.articleId);
    }
  });

  // Process view statuses
  viewStatuses.forEach((status) => {
    if (status && typeof status === 'object' && 'isRead' in status && status.isRead) {
      readArticleIds.add(status.articleId);
    }
  });

  return {
    favoritedArticleIds,
    readArticleIds,
  };
}

/**
 * Merge user-specific data (favorites, read status) with article items
 */
export function mergeUserData<T extends { id: string }>(
  items: T[],
  userSpecificData: UserSpecificArticleData
): Array<T & ArticleUserOverlay> {
  if (items.length === 0) {
    return [];
  }

  const { favoritedArticleIds, readArticleIds } = userSpecificData;

  return items.map((item) => ({
    ...item,
    isFavorited: favoritedArticleIds.has(item.id),
    isRead: readArticleIds.has(item.id),
  }));
}

/**
 * Extract article IDs from items array safely
 */
export function extractArticleIds<T>(items: T[]): string[] {
  return items
    .map((article) => {
      if (typeof article === 'object' && article !== null && 'id' in article) {
        return (article as { id: string }).id;
      }
      return '';
    })
    .filter((id) => id !== '');
}
