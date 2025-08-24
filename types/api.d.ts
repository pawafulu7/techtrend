/**
 * API response and request type definitions
 */

// Base API response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Paginated response
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Article API response
export interface ArticleApiResponse {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: string; // ISO string
  sourceId: string;
  source: {
    id: string;
    name: string;
    type: string;
  };
  tags: string[];
  bookmarkCount?: number;
  viewCount?: number;
}

// Search filters
export interface SearchFilters {
  keyword?: string;
  sourceIds?: string[];
  tags?: string[];
  dateRange?: 'today' | 'week' | 'month' | 'three_months';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'oldest' | 'relevance';
}

// Summary generation request
export interface SummaryGenerationRequest {
  title: string;
  content: string;
  url?: string;
  sourceId?: string;
}

// Summary generation response
export interface SummaryGenerationResponse {
  summary: string;
  detailedSummary: string;
  tags: string[];
  qualityScore: number;
  summaryVersion: number;
}

// Source response
export interface SourceResponse {
  id: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  articleCount?: number;
  latestArticle?: string;
}

// User favorite request
export interface FavoriteRequest {
  articleId: string;
  action: 'add' | 'remove';
}

// Recommendation response
export interface RecommendationResponse {
  recommendedArticles: ArticleApiResponse[];
  basedOn: 'favorites' | 'history' | 'popular';
  score?: number;
}