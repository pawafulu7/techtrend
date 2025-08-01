// Prisma query types for type safety
export interface ArticleWhereInput {
  sourceId?: string;
  qualityScore?: {
    gte?: number;
    lte?: number;
  };
  tags?: {
    some?: {
      name?: string;
    };
  };
  OR?: Array<{
    title?: { contains: string };
    summary?: { contains: string };
  }>;
  AND?: Array<ArticleWhereInput>;
  publishedAt?: {
    gte?: Date;
    lte?: Date;
  };
  difficulty?: string;
  bookmarks?: {
    gte?: number;
    lte?: number;
  };
}

export interface ArticleOrderByInput {
  publishedAt?: 'asc' | 'desc';
  qualityScore?: 'asc' | 'desc';
  bookmarks?: 'asc' | 'desc';
  userVotes?: 'asc' | 'desc';
  createdAt?: 'asc' | 'desc';
  updatedAt?: 'asc' | 'desc';
  title?: 'asc' | 'desc';
}

export interface SourceWhereInput {
  enabled?: boolean;
  type?: string;
  name?: {
    contains?: string;
    equals?: string;
  };
}

export interface TagWhereInput {
  name?: {
    contains?: string;
    equals?: string;
  };
  articles?: {
    some?: ArticleWhereInput;
  };
}

export interface ArticleCreateInput {
  title: string;
  url: string;
  summary?: string;
  thumbnail?: string;
  content?: string;
  publishedAt: Date;
  sourceId: string;
  qualityScore?: number;
  bookmarks?: number;
  userVotes?: number;
  difficulty?: string;
  detailedSummary?: string;
  tags?: {
    connectOrCreate?: Array<{
      where: { name: string };
      create: { name: string };
    }>;
  };
}

export interface SourceCreateInput {
  name: string;
  type: string;
  url: string;
  enabled?: boolean;
}