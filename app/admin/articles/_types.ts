/**
 * Admin Articles - 型定義
 */

// 品質ステータス
export const QUALITY_STATUS_VALUES = [
  'missing_summary',
  'missing_category',
  'missing_content',
  'low_quality',
  'has_error',
  'skipped',
] as const;
export type QualityStatus = (typeof QUALITY_STATUS_VALUES)[number];

// カテゴリ定数（Prisma ArticleCategory enum準拠）
export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'frontend', label: 'フロントエンド' },
  { value: 'backend', label: 'バックエンド' },
  { value: 'ai_ml', label: 'AI・機械学習' },
  { value: 'security', label: 'セキュリティ' },
  { value: 'devops', label: 'DevOps' },
  { value: 'database', label: 'データベース' },
  { value: 'mobile', label: 'モバイル' },
  { value: 'web3', label: 'Web3' },
  { value: 'design', label: 'デザイン' },
  { value: 'testing', label: 'テスト' },
  { value: 'performance', label: 'パフォーマンス' },
  { value: 'architecture', label: 'アーキテクチャ' },
];

// 一覧APIの記事型（軽量）
export interface AdminArticleListItem {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceId: string;
  category: string | null;
  qualityScore: number;
  hasSummary: boolean;
  hasContent: boolean;
  skipReason: string | null;
  hasSummaryError: boolean;
  bookmarks: number;
  isHidden: boolean;
}

// 品質集計サマリー
export interface QualitySummary {
  totalArticles: number;
  missingSummary: number;
  missingCategory: number;
  missingContent: number;
  lowQuality: number; // qualityScore > 0 AND < 30
  hasError: number;
  skipped: number;
  hidden: number;
}

// ソース情報（フィルタ用）
export interface AdminSource {
  id: string;
  name: string;
  enabled: boolean;
}

// 一覧APIレスポンス
export interface AdminArticlesResponse {
  articles: AdminArticleListItem[];
  totalCount: number;
  qualitySummary: QualitySummary;
  sources: AdminSource[];
  page: number;
  perPage: number;
  totalPages: number;
}

// 詳細APIレスポンス - 全フィールド含む
export interface AdminArticleDetail extends AdminArticleListItem {
  summary: string | null;
  detailedSummary: string | null;
  content: string | null;
  contentLength: number | null;
  difficulty: string | null;
  articleType: string | null;
  summaryVersion: number;
  summaryError: string | null;
  summaryComputedAt: string | null;
  qualityScoreComputedAt: string | null;
  contentUpdatedAt: string | null;
  userVotes: number;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string }[];
}

// 表示状態フィルタ型
export type VisibilityFilter = 'all' | 'visible' | 'hidden';

// 一覧APIのフィルタパラメータ型
export interface AdminArticleFilterParams {
  page?: number;
  perPage?: number;
  sourceId?: string;
  category?: string;
  qualityStatus?: QualityStatus;
  query?: string;
  visibility?: VisibilityFilter;
}
