import type { ArticleCategory } from '@/lib/prisma-exports';

// Lightweight article type with minimal source relation included for UI rendering
export interface LightweightArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date | string;
  sourceId: string;
  source: {
    id: string;
    name: string;
    type: string;
    url: string;
  };
  category: ArticleCategory | null;
  qualityScore: number;
  bookmarks: number;
  userVotes: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Content length for reading time calculation (content itself excluded for performance)
  contentLength?: number | null;
  // User-specific data (when includeUserData=true)
  isFavorited?: boolean;
  isRead?: boolean;
  // Company name for hatena_blog_dev articles
  companyName?: string;
}

/**
 * Merge user-specific data (favorites, read status) into article items
 */
export function mergeUserDataIntoItems<T extends { id: string }>(
  items: T[],
  favoritesMap: Map<string, boolean>,
  readStatusMap: Map<string, boolean>
): (T & { isFavorited: boolean; isRead: boolean })[] {
  return items.map((article) => ({
    ...article,
    isFavorited: favoritesMap.get(article.id) || false,
    isRead: readStatusMap.get(article.id) || false,
  }));
}
