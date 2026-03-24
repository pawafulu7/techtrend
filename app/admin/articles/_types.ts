/**
 * Admin Articles - 型定義
 */

// 品質ステータスの分類
export type QualityStatus =
  | 'missing_summary'
  | 'missing_category'
  | 'missing_content'
  | 'low_quality'
  | 'has_error'
  | 'skipped';

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
