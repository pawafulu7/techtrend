/**
 * API Response Type Definitions
 * 共通のAPIレスポンス型定義
 */

import type { User } from '@prisma/client';
import type { Article, Source, Tag, ArticleWithRelations as ArticleWithRelationsBase } from './prisma-override';

// 基本的なAPIレスポンス
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ページネーションレスポンス
export interface PaginatedResponse<T> extends ApiResponse<T> {
  data: T;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 記事の拡張型（リレーション含む）
export type ArticleWithRelations = ArticleWithRelationsBase;

// 記事リストレスポンス
export interface ArticlesResponse {
  articles: ArticleWithRelations[];
  total: number;
  page: number;
  limit: number;
}

// ソース統計情報
export interface SourceStats {
  id: string;
  name: string;
  type: string;
  articleCount: number;
  avgQualityScore: number;
  lastFetchedAt?: Date | null;
}

// ソースレスポンス
export interface SourcesResponse {
  sources: SourceStats[];
  total: number;
}

// 統計情報レスポンス
export interface StatsResponse {
  articles: {
    total: number;
    today: number;
    week: number;
    month: number;
  };
  sources: {
    total: number;
    active: number;
  };
  tags: {
    total: number;
    unique: number;
  };
  users: {
    total: number;
    active: number;
  };
  quality: {
    average: number;
    distribution: Record<string, number>;
  };
}

// トレンド分析レスポンス
export interface TrendAnalysisResponse {
  trends: Array<{
    tag: string;
    count: number;
    growth: number;
    articles: ArticleWithRelations[];
  }>;
  period: {
    start: Date;
    end: Date;
    days: number;
  };
}

// タグクラウドレスポンス
export interface TagCloudResponse {
  tags: Array<{
    name: string;
    count: number;
    weight: number;
    category?: string | null;
  }>;
  total: number;
}

// 推薦レスポンス
export interface RecommendationsResponse {
  recommendations: ArticleWithRelations[];
  strategy: 'collaborative' | 'content' | 'hybrid' | 'popular';
  score?: number;
}

// お気に入りレスポンス
export interface FavoritesResponse {
  favorites: Array<{
    id: string;
    articleId: string;
    userId: string;
    createdAt: Date;
    article: ArticleWithRelations;
  }>;
  total: number;
}

// 閲覧履歴レスポンス
export interface ViewHistoryResponse {
  views: Array<{
    id: string;
    articleId: string;
    userId: string;
    viewedAt: Date;
    article: ArticleWithRelations;
  }>;
  total: number;
}

// ヘルスチェックレスポンス
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  timestamp: string;
  details?: {
    database?: {
      latency?: number;
      error?: string;
    };
    redis?: {
      latency?: number;
      error?: string;
    };
  };
}

// エラーレスポンス
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  timestamp?: string;
}

// 成功レスポンス
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

// 型ガード関数
export function isErrorResponse(response: any): response is ErrorResponse {
  return response && response.success === false && 'error' in response;
}

export function isSuccessResponse<T>(response: any): response is SuccessResponse<T> {
  return response && response.success === true && 'data' in response;
}

// テスト用のモックレスポンス生成ヘルパー
export function createMockArticle(overrides?: Partial<ArticleWithRelations>): ArticleWithRelations {
  const now = new Date();
  return {
    id: 'test-article-id',
    title: 'Test Article',
    summary: 'Test summary',
    detailedSummary: 'Test detailed summary',
    url: 'https://example.com/article',
    thumbnail: null,
    content: null,
    publishedAt: now,
    sourceId: 'test-source',
    qualityScore: 80,
    summaryVersion: 7,
    articleType: 'unified',
    difficulty: null,
    createdAt: now,
    updatedAt: now,
    source: {
      id: 'test-source',
      name: 'Test Source',
      type: 'rss',
      url: 'https://test-source.com',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    tags: [],
    ...overrides,
  };
}

export function createMockSource(overrides?: Partial<Source>): Source {
  const now = new Date();
  return {
    id: 'test-source',
    name: 'Test Source',
    type: 'rss',
    url: 'https://test-source.com',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createMockTag(overrides?: Partial<Tag>): Tag {
  const now = new Date();
  return {
    id: 'test-tag',
    name: 'TestTag',
    category: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}