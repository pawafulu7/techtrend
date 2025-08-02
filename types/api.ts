// API関連の型定義

// 基本的なAPIレスポンス型
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

// ページネーション関連
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

// 検索関連
export interface SearchParams extends PaginationParams {
  query?: string;
  source?: string;
  tags?: string[];
  startDate?: string;
  endDate?: string;
  minQuality?: number;
  maxQuality?: number;
  difficulty?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 統計関連
export interface StatsResponse {
  totalArticles: number;
  totalSources: number;
  totalTags: number;
  articlesWithSummary: number;
  averageQualityScore: number;
  lastUpdated: string;
}

export interface SourceStats {
  sourceId: string;
  sourceName: string;
  articleCount: number;
  averageQuality: number;
  lastArticleDate: string;
}

export interface TagStats {
  tagName: string;
  articleCount: number;
  trend: 'rising' | 'stable' | 'declining';
  growthRate: number;
}

// フィード収集関連
export interface CollectResult {
  source: string;
  success: boolean;
  newArticles: number;
  totalArticles: number;
  error?: string;
}

export interface CollectResponse {
  results: CollectResult[];
  summary: {
    totalNewArticles: number;
    successfulSources: number;
    failedSources: number;
  };
}

// 要約生成関連
export interface SummaryGenerateParams {
  articleIds?: string[];
  source?: string;
  limit?: number;
  batchSize?: number;
}

export interface SummaryGenerateResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{
    articleId: string;
    error: string;
  }>;
}

// 品質スコア関連
export interface QualityScoreParams {
  source?: string;
  recalculate?: boolean;
  minScore?: number;
  maxScore?: number;
}

export interface QualityScoreResult {
  processed: number;
  updated: number;
  average: number;
  distribution: {
    excellent: number;  // 80+
    good: number;       // 60-79
    fair: number;       // 40-59
    poor: number;       // 20-39
    veryPoor: number;   // 0-19
  };
}

// エラーレスポンス
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
}