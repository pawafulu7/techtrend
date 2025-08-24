/**
 * Centralized API type definitions
 * Replaces any usage in API routes and responses
 */

import { Article, Source, Tag, User } from '@prisma/client';

// Base API Response type
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

// Article types
export interface ArticleWithRelations extends Article {
  source: Source;
  tags: Tag[];
  _count?: {
    favorites?: number;
    views?: number;
  };
}

export interface ArticleSearchParams extends PaginationParams {
  query?: string;
  tags?: string[];
  sources?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'date' | 'popularity' | 'relevance';
  order?: 'asc' | 'desc';
}

export interface ArticleCreateInput {
  title: string;
  url: string;
  summary?: string;
  content?: string;
  thumbnail?: string;
  publishedAt: Date | string;
  sourceId: string;
  tags?: string[];
}

export interface ArticleUpdateInput extends Partial<ArticleCreateInput> {
  id: string;
}

// Source types
export interface SourceWithStats extends Source {
  _count: {
    articles: number;
  };
  latestArticle?: {
    publishedAt: Date;
  };
}

export interface SourceCreateInput {
  name: string;
  url: string;
  type: 'rss' | 'api' | 'scraping';
  enabled?: boolean;
}

// Tag types
export interface TagWithStats extends Tag {
  _count: {
    articles: number;
  };
}

export interface TagCloudItem {
  name: string;
  count: number;
  category?: string | null;
}

// User types
export interface UserWithStats extends User {
  _count: {
    favorites: number;
    viewHistory: number;
  };
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  viewMode?: 'grid' | 'list';
  sourcesFilter?: string[];
  tagsFilter?: string[];
  dateRange?: {
    from?: string;
    to?: string;
  };
}

// Summary generation types
export interface SummaryGenerationRequest {
  articleId?: string;
  title: string;
  content: string;
  url?: string;
}

export interface SummaryGenerationResponse {
  summary: string;
  detailedSummary?: string;
  tags?: string[];
  qualityScore?: number;
  model?: string;
}

// Stats types
export interface StatsOverview {
  totalArticles: number;
  totalSources: number;
  totalTags: number;
  totalUsers: number;
  articlesLast7Days: number;
  articlesLast30Days: number;
  topSources: SourceWithStats[];
  topTags: TagCloudItem[];
}

export interface TrendAnalysis {
  date: string;
  count: number;
  source?: string;
  tag?: string;
}

// Cache types
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage?: number;
}

// Recommendation types
export interface RecommendationItem {
  article: ArticleWithRelations;
  score: number;
  reason: 'similar_content' | 'user_preference' | 'trending' | 'collaborative';
}

export interface RecommendationResponse {
  recommendations: RecommendationItem[];
  basedOn?: string[];
}

// Webhook types for external integrations
export interface WebhookPayload {
  event: 'article.created' | 'article.updated' | 'summary.generated';
  timestamp: string;
  data: Record<string, unknown>;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

// Request validation types
export interface ValidatedRequest<T = unknown> {
  isValid: boolean;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// Response helpers
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(error: string, details?: unknown): ApiResponse {
  return {
    success: false,
    error,
    ...(details && { message: JSON.stringify(details) }),
  };
}

export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };
}