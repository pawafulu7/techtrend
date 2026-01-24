/**
 * Social Post Types
 *
 * X投稿コンテンツ自動生成機能の型定義
 */

import type { SocialPostStatus, SocialPostSource } from '@prisma/client';

// Re-export Prisma types
export type {
  SocialPost,
  SocialPostAuditLog,
  SocialPostStatus,
  SocialPostSource,
} from '@prisma/client';

// =============================================================================
// Input Types
// =============================================================================

/**
 * SocialPost作成入力
 */
export interface CreateSocialPostInput {
  content: string;
  hashtags: string[];
  sourceUrls: string[];
  source: SocialPostSource;
  sourceIds?: string[];
  modelVersion?: string;
  promptVersion?: string;
  contextSummary?: string;
}

/**
 * SocialPost更新入力
 */
export interface UpdateSocialPostInput {
  content?: string;
  hashtags?: string[];
  sourceUrls?: string[];
  status?: SocialPostStatus;
  scheduledAt?: Date | null;
}

/**
 * AI生成パラメータ
 */
export interface GenerateParams {
  source: Exclude<SocialPostSource, 'MANUAL'>;
  sourceIds: string[];
}

/**
 * 一括操作パラメータ
 */
export interface BulkActionParams {
  action: 'changeStatus' | 'delete';
  ids: string[];
  status?: SocialPostStatus;
}

// =============================================================================
// Filter Types
// =============================================================================

/**
 * 一覧取得フィルター
 */
export interface SocialPostFilters {
  status?: SocialPostStatus | 'all';
  source?: SocialPostSource | 'all';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * ページネーション結果
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * AI生成結果
 */
export interface GeneratedContent {
  comment: string;
  sourceUrls: string[];
  modelVersion: string;
  promptVersion: string;
  contextSummary: string;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * AI生成結果（部分成功対応）
 */
export interface GenerateResult<T> {
  succeeded: T[];
  failed: Array<{
    sourceId: string;
    error: string;
  }>;
}

// =============================================================================
// Generation Context Types
// =============================================================================

/**
 * 生成時の文脈情報
 */
export interface GenerationContext {
  relatedTrends?: string[];
  recentArticles?: string[];
  /** 同じタグを持つ過去の記事（時間軸の視点用） */
  historicalArticles?: HistoricalArticle[];
}

/** 過去記事の情報（時間軸比較用） */
export interface HistoricalArticle {
  title: string;
  summary: string;
  publishedAt: Date;
}

/**
 * プロンプト用記事情報
 */
export interface ArticleForPrompt {
  title: string;
  summary: string;
  url: string;
  category: string;
}

/**
 * プロンプト用Daily Trend情報
 */
export interface DailyTrendForPrompt {
  period: Date;
  summary: string;
  topArticles: { title: string; url: string }[];
  categories: Record<string, number>;
}

/**
 * プロンプト用Diff Summary情報
 */
export interface DiffSummaryForPrompt {
  category: string;
  period: string;
  risingTopics: { topic: string; change: number }[];
  unchanged: string[];
}

// =============================================================================
// AI Output Types
// =============================================================================

/**
 * AI生成出力（JSON形式）
 */
export interface XPostOutput {
  comment: string;
  hashtag: string;
  reasoning?: string;
}

// =============================================================================
// Audit Types
// =============================================================================

/**
 * 監査ログアクション
 */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'GENERATE'
  | 'PUBLISH'
  | 'REVIEW'
  | 'BULK_UPDATE'
  | 'BULK_DELETE';

/**
 * 監査ログメタデータ
 */
export interface AuditMetadata {
  source?: SocialPostSource;
  sourceId?: string;
  modelVersion?: string;
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
}
