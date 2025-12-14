/**
 * お気に入り関連の型定義
 *
 * Prismaモデルの型に合わせた定義:
 * - 全てのIDは String @id @default(cuid())
 * - favoritedAt は DateTime (createdAt)
 */

/**
 * お気に入り記事の型（APIレスポンス）
 * IDはPrismaのcuid()に合わせてstring
 */
export interface FavoriteArticle {
  id: string;
  title: string;
  translatedTitle?: string | null;
  summary: string | null;
  url: string;
  publishedAt: string;
  thumbnail?: string | null;
  source: {
    id: string;
    name: string;
  };
  companyName?: string | null;
  tags?: Array<{
    id: string;
    name: string;
  }>;
  contentLength?: number;
  content?: string | null;
  favoriteId: string;
  favoritedAt: string;
  qualityScore?: number | null;
}

/**
 * お気に入りアイテムの型（日付グルーピング用）
 */
export interface FavoriteItem {
  favoritedAt: string;
  article: FavoriteArticle;
}

/**
 * ページネーション情報
 */
export interface FavoritesPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * GET /api/favorites レスポンスの型
 */
export interface FavoritesApiResponse {
  favorites: FavoriteArticle[];
  pagination: FavoritesPagination;
}
