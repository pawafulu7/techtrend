// 推薦システムの型定義

export interface UserInterests {
  tagScores: Map<string, number>;
  totalActions: number;
  lastUpdated: Date;
}

export interface RecommendationScore {
  articleId: string;
  score: number;
  matchedTags: string[];
  reasons: string[];
}

export interface RecommendedArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: Date;
  sourceName: string;
  tags: string[];
  recommendationScore: number;
  recommendationReasons: string[];
}

export interface UserAction {
  type: 'view' | 'favorite';
  articleId: string;
  timestamp: Date;
  tags: string[];
}

export interface RecommendationConfig {
  maxRecommendations: number;
  maxPerSource: number;
  maxSameTagSet: number;
  viewWeight: number;
  favoriteWeight: number;
  recentBoost7Days: number;
  recentBoost30Days: number;
  newArticleBoost: number;
  minQualityScore: number;
}

// キャッシュ用の型定義
export interface CachedUserInterests {
  tagScores: Record<string, number>;
  totalActions: number;
  lastUpdated: string;
}