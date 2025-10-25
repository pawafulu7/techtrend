import { z } from 'zod';

export const articleLinkSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  similarity: z.number().min(0).max(1),
  publishedAt: z.string(), // ISO 8601
});

export type ArticleLink = z.infer<typeof articleLinkSchema>;
