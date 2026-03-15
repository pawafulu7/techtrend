import { z } from 'zod';

export const articleLinkSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  translatedTitle: z.string().trim().optional().nullable(),
  similarity: z.number().min(0).max(1),
  publishedAt: z.string(), // ISO 8601
  summary: z.string().optional(),
});

export type ArticleLink = z.infer<typeof articleLinkSchema>;
