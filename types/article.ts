/**
 * Article Type Definitions
 * 記事関連の型定義
 */

// 記事タイプの定義
export type ArticleType = 'unified' | 'legacy' | 'presentation' | 'news' | 'blog' | null;

// 難易度レベル
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | null;

// 記事ソースタイプ
export type SourceType = 'rss' | 'api' | 'scraping';

// 要約バージョン
export const SUMMARY_VERSION = {
  LEGACY: 1,      // 旧バージョン
  V2: 2,          // バージョン2
  V3: 3,          // バージョン3
  V4: 4,          // バージョン4
  V5: 5,          // バージョン5
  V6: 6,          // バージョン6
  UNIFIED: 7,     // 統一バージョン（最新）
} as const;

// 記事品質スコアの閾値
export const QUALITY_SCORE = {
  EXCELLENT: 90,
  GOOD: 70,
  AVERAGE: 50,
  POOR: 30,
  MINIMUM: 0,
} as const;

// 記事の表示形式
export interface ArticleDisplay {
  showThumbnail: boolean;
  showSummary: boolean;
  showDetailedSummary: boolean;
  showTags: boolean;
  showQualityScore: boolean;
  showSource: boolean;
  showPublishedDate: boolean;
}

// デフォルトの表示設定
export const DEFAULT_ARTICLE_DISPLAY: ArticleDisplay = {
  showThumbnail: true,
  showSummary: true,
  showDetailedSummary: false,
  showTags: true,
  showQualityScore: true,
  showSource: true,
  showPublishedDate: true,
};

// プレゼンテーション記事の表示設定
export const PRESENTATION_ARTICLE_DISPLAY: ArticleDisplay = {
  showThumbnail: true,
  showSummary: false,
  showDetailedSummary: false,
  showTags: true,
  showQualityScore: false,
  showSource: true,
  showPublishedDate: true,
};

// 記事フィルタリングオプション
export interface ArticleFilterOptions {
  sourceIds?: string[];
  tags?: string[];
  qualityScoreMin?: number;
  qualityScoreMax?: number;
  publishedAfter?: Date;
  publishedBefore?: Date;
  articleTypes?: ArticleType[];
  difficulties?: DifficultyLevel[];
  searchQuery?: string;
}

// 記事ソートオプション
export type ArticleSortOption = 
  | 'publishedAt_desc'
  | 'publishedAt_asc'
  | 'qualityScore_desc'
  | 'qualityScore_asc'
  | 'createdAt_desc'
  | 'createdAt_asc';

// 記事ページネーションオプション
export interface ArticlePaginationOptions {
  page: number;
  limit: number;
  offset?: number;
}

// 記事統計情報
export interface ArticleStats {
  totalCount: number;
  averageQualityScore: number;
  sourceDistribution: Record<string, number>;
  tagDistribution: Record<string, number>;
  typeDistribution: Record<Exclude<ArticleType, null> | 'null', number>;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
}

// 記事のエンリッチメントデータ
export interface ArticleEnrichment {
  readingTime?: number;           // 読了時間（分）
  wordCount?: number;              // 単語数
  sentiment?: 'positive' | 'neutral' | 'negative';  // 感情分析
  keyPhrases?: string[];           // キーフレーズ
  relatedArticleIds?: string[];   // 関連記事ID
  popularity?: number;             // 人気度スコア
}

// 記事の処理ステータス
export interface ArticleProcessingStatus {
  isFetched: boolean;
  isSummarized: boolean;
  isTagged: boolean;
  isQualityChecked: boolean;
  isEnriched: boolean;
  lastProcessedAt?: Date;
  errors?: string[];
}

// 記事の品質評価
export interface ArticleQualityAssessment {
  score: number;
  factors: {
    contentLength: number;
    summaryQuality: number;
    tagRelevance: number;
    sourceReliability: number;
    freshness: number;
  };
  issues?: string[];
  suggestions?: string[];
}

// 記事の変換ユーティリティ
export function isHighQualityArticle(qualityScore: number): boolean {
  return qualityScore >= QUALITY_SCORE.GOOD;
}

export function isRecentArticle(publishedAt: Date, daysThreshold: number = 7): boolean {
  const now = new Date();
  const diffInDays = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
  return diffInDays <= daysThreshold;
}

export function getArticleTypeDisplay(type: ArticleType): string {
  switch (type) {
    case 'unified': return '統一形式';
    case 'legacy': return 'レガシー';
    case 'presentation': return 'プレゼンテーション';
    case 'news': return 'ニュース';
    case 'blog': return 'ブログ';
    default: return '未分類';
  }
}

export function getDifficultyDisplay(difficulty: DifficultyLevel): string {
  switch (difficulty) {
    case 'beginner': return '初級';
    case 'intermediate': return '中級';
    case 'advanced': return '上級';
    default: return '未設定';
  }
}

export function getQualityScoreLabel(score: number): string {
  if (score >= QUALITY_SCORE.EXCELLENT) return '優秀';
  if (score >= QUALITY_SCORE.GOOD) return '良好';
  if (score >= QUALITY_SCORE.AVERAGE) return '平均';
  if (score >= QUALITY_SCORE.POOR) return '要改善';
  return '低品質';
}

export function getQualityScoreColor(score: number): string {
  if (score >= QUALITY_SCORE.EXCELLENT) return 'text-green-600';
  if (score >= QUALITY_SCORE.GOOD) return 'text-blue-600';
  if (score >= QUALITY_SCORE.AVERAGE) return 'text-yellow-600';
  if (score >= QUALITY_SCORE.POOR) return 'text-orange-600';
  return 'text-red-600';
}
