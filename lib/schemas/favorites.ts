/**
 * お気に入りAPI レスポンスの Zod スキーマ
 *
 * Prisma モデルの型に合わせた定義:
 * - 全てのIDは String @id @default(cuid())
 * - favoritedAt は DateTime (ISO 8601形式)
 */

import { z } from 'zod';

/**
 * 単一のお気に入り記事のスキーマ
 */
export const FavoriteArticleSchema = z.object({
  id: z.string(), // Article.id: String @id @default(cuid())
  title: z.string(),
  translatedTitle: z.string().nullable().optional(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string(),
  thumbnail: z.string().nullable().optional(),
  source: z.object({
    id: z.string(), // Source.id: String @id @default(cuid())
    name: z.string(),
  }),
  companyName: z.string().nullable().optional(),
  tags: z
    .array(
      z.object({
        id: z.string(), // Tag.id: String @id @default(cuid())
        name: z.string(),
      })
    )
    .optional(),
  contentLength: z.number().optional(),
  content: z.string().nullable().optional(),
  favoriteId: z.string(), // Favorite.id: String @id @default(cuid())
  favoritedAt: z.string(), // Favorite.createdAt: DateTime
  qualityScore: z.number().nullable().optional(),
});

/**
 * ページネーション情報のスキーマ
 */
export const FavoritesPaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

/**
 * GET /api/favorites レスポンスのスキーマ
 */
export const FavoritesResponseSchema = z.object({
  favorites: z.array(FavoriteArticleSchema),
  pagination: FavoritesPaginationSchema,
});

/**
 * スキーマから推論された型
 */
export type FavoriteArticleResponse = z.infer<typeof FavoriteArticleSchema>;
export type FavoritesPaginationResponse = z.infer<
  typeof FavoritesPaginationSchema
>;
export type FavoritesResponse = z.infer<typeof FavoritesResponseSchema>;
