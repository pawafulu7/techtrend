/**
 * Database query and model type definitions
 */

import { Prisma } from '@prisma/client';

// Article where clause type
export interface ArticleWhereClause {
  publishedAt?: {
    gte?: Date;
    lte?: Date;
  };
  sourceId?: string | { in?: string[] };
  tags?: {
    some?: {
      name?: {
        in?: string[];
      };
    };
  };
  OR?: Array<{
    title?: {
      contains?: string;
      mode?: Prisma.QueryMode;
    };
    summary?: {
      contains?: string;
      mode?: Prisma.QueryMode;
    };
  }>;
  AND?: Array<any>;
  summaryVersion?: number | { lte?: number; gte?: number };
  summary?: { not?: null } | null;
  detailedSummary?: string | { not?: string };
  content?: { not?: null } | null;
}

// Article with relations
export interface ArticleWithRelations {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  detailedSummary: string | null;
  content: string | null;
  thumbnail: string | null;
  publishedAt: Date;
  sourceId: string;
  summaryVersion: number;
  articleType: string;
  qualityScore: number | null;
  bookmarks: number | null;
  userVotes: number | null;
  difficulty: string | null;
  createdAt: Date;
  updatedAt: Date;
  source: {
    id: string;
    name: string;
    type: string;
    url: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  tags: Array<{
    id: string;
    name: string;
    category: string | null;
  }>;
  _count?: {
    readingList?: number;
  };
}

// Update data type for articles
export interface ArticleUpdateData {
  summary?: string;
  detailedSummary?: string;
  content?: string;
  summaryVersion?: number;
  articleType?: string;
  qualityScore?: number;
  tags?: {
    set?: Array<{ id: string }>;
    connect?: Array<{ id: string }>;
    disconnect?: Array<{ id: string }>;
  };
}

// Source statistics
export interface SourceStats {
  sourceId: string;
  name: string;
  articleCount: number;
  avgQualityScore: number | null;
  latestArticleDate: Date | null;
}