/**
 * 共通型定義
 */

// エラーレスポンス型
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: any;
}

// 推薦設定型
export interface RecommendationConfig {
  activityWindow?: number;
  maxActivityHistory?: number;
  weights?: {
    view?: number;
    favorite?: number;
    recent?: number;
    popular?: number;
  };
}

// 記事拡張型
export interface ExtendedArticle {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  sourceId: string;
  qualityScore?: number;
  description?: string;
  keywords?: string[];
  tagNames?: string[];
  tags?: Array<{
    id: string;
    name: string;
    category?: string | null;
  }>;
  tagScores?: Record<string, number>;
  totalActions?: number;
  [key: string]: any; // その他のプロパティ
}

// ソース統計型
export interface SourceStats {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  articleCount: number;
  avgQualityScore: number;
  lastArticleDate?: Date | null;
  tags?: string[];
}

// API応答基本型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ページネーション型
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// 記事リスト応答型
export interface ArticlesResponse {
  articles: ExtendedArticle[];
  pagination: PaginationMeta;
  cacheStatus?: string;
}

// タグ型
export interface Tag {
  id: string;
  name: string;
  category?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  articleCount?: number;
}

// ユーザーアクティビティ型
export interface UserActivity {
  userId: string;
  articleId: string;
  action: 'view' | 'favorite' | 'share';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// 検索パラメータ型
export interface SearchParams {
  query?: string;
  sources?: string | string[];
  tags?: string | string[];
  dateRange?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// テスト用型の拡張
export interface TestData {
  id: string;
  name?: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: any;
}