import type { Article, Source, Tag } from '@prisma/client';

export type ArticleWithRelations = Article & {
  source: Source;
  tags: Tag[];
};

export type CreateArticleInput = {
  title: string;
  url: string;
  summary?: string;
  thumbnail?: string;
  content?: string;
  publishedAt: Date;
  sourceId: string;
  tagNames?: string[];
};

export type UpdateArticleInput = Partial<CreateArticleInput>;