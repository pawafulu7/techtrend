// Prismaモデルの再エクスポートと拡張型定義
import { Prisma } from '@prisma/client';

// Prismaの自動生成型を再エクスポート
export type {
  Article,
  Source,
  Tag,
  PrismaClient,
} from '@prisma/client';

// 関連を含むモデル型
export type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: { source: true; tags: true };
}>;

export type SourceWithCount = Prisma.SourceGetPayload<{
  include: { _count: { select: { articles: true } } };
}>;

export type TagWithCount = Prisma.TagGetPayload<{
  include: { _count: { select: { articles: true } } };
}>;

export type ArticleWithSource = Prisma.ArticleGetPayload<{
  include: { source: true };
}>;

export type ArticleWithTags = Prisma.ArticleGetPayload<{
  include: { tags: true };
}>;

// 詳細な記事情報（品質スコア計算用）
export type ArticleWithDetails = Prisma.ArticleGetPayload<{
  include: {
    source: true;
    tags: true;
  };
}>;

// ユーザー固有データを含む記事型（無限スクロール用）
export type ArticleWithUserData = ArticleWithRelations & {
  isFavorited?: boolean;
  isRead?: boolean;
  onToggleFavorite?: () => void;
};

// CreateとUpdate用の入力型
export type ArticleCreateInput = Prisma.ArticleCreateInput;
export type ArticleUpdateInput = Prisma.ArticleUpdateInput;
export type SourceCreateInput = Prisma.SourceCreateInput;
export type SourceUpdateInput = Prisma.SourceUpdateInput;
export type TagCreateInput = Prisma.TagCreateInput;
export type TagUpdateInput = Prisma.TagUpdateInput;

// Fetcher用の記事作成入力型
export type CreateArticleInput = {
  title: string;
  url: string;
  publishedAt: Date;
  sourceId: string;
  summary?: string | null;
  detailedSummary?: string | null;
  content?: string | null;
  thumbnail?: string | null;
  tags?: string[];
  tagNames?: string[];
  qualityScore?: number;
  summaryVersion?: number;
  articleType?: string | null;
  difficulty?: string | null;
  metadata?: Record<string, unknown>;
  author?: string;
};

// Where条件の型
export type ArticleWhereInput = Prisma.ArticleWhereInput;
export type SourceWhereInput = Prisma.SourceWhereInput;
export type TagWhereInput = Prisma.TagWhereInput;

// OrderBy条件の型
export type ArticleOrderByInput = Prisma.ArticleOrderByWithRelationInput;
export type SourceOrderByInput = Prisma.SourceOrderByWithRelationInput;
export type TagOrderByInput = Prisma.TagOrderByWithRelationInput;
