// Prisma型の一時的な修正
import type { Tag as _PrismaTag, Source as _PrismaSource, Article as _PrismaArticle } from '@prisma/client';

// 明示的に型を定義
export interface Tag {
  id: string;
  name: string;
  category: string | null;
}

export interface Source {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Article {
  id: string;
  title: string;
  summary: string | null;
  detailedSummary: string | null;
  url: string;
  thumbnail: string | null;
  content: string | null;
  publishedAt: Date;
  sourceId: string;
  qualityScore: number | null;
  summaryVersion: number | null;
  articleType: string | null;
  difficulty: string | null;
  createdAt: Date;
  updatedAt: Date;
  bookmarks: number | null;
  userVotes: number | null;
}

export interface ArticleWithRelations extends Article {
  source: Source;
  tags: Tag[];
}