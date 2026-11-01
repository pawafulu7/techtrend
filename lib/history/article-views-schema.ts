/**
 * article-views API レスポンスの Zod スキーマ
 *
 * Prisma モデルの型に合わせた定義:
 * - 全てのIDは String @id @default(cuid())
 * - viewedAt は DateTime? (nullable)
 */

import { z } from 'zod';

/**
 * 単一の閲覧記事のスキーマ
 */
export const ArticleViewSchema = z.object({
  id: z.string(),           // Article.id: String @id @default(cuid())
  viewId: z.string(),       // ArticleView.id: String @id @default(cuid())
  title: z.string(),
  translatedTitle: z.string().nullable().optional(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string(),
  viewedAt: z.string().nullable(), // ArticleView.viewedAt: DateTime? (nullable)
  source: z.object({
    id: z.string(),         // Source.id: String @id @default(cuid())
    name: z.string(),
  }),
  companyName: z.string().nullable().optional(),
  tags: z
    .array(
      z.object({
        id: z.string(),     // Tag.id: String @id @default(cuid())
        name: z.string(),
      })
    )
    .optional(),
  contentLength: z.number().optional(),
  content: z.string().nullable().optional(),
});

/**
 * GET /api/article-views レスポンスのスキーマ
 */
export const ArticleViewsResponseSchema = z.object({
  views: z.array(ArticleViewSchema),
});

/**
 * スキーマから推論された型
 */
export type ArticleViewResponse = z.infer<typeof ArticleViewSchema>;
export type ArticleViewsResponse = z.infer<typeof ArticleViewsResponseSchema>;
