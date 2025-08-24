import { RecommendationConfig } from './types';

// デフォルト設定
export const defaultConfig: any = {
  maxRecommendations: 20,
  maxPerSource: 3,
  maxSameTagSet: 2,
  viewWeight: 1,
  favoriteWeight: 3,
  recentBoost7Days: 2,
  recentBoost30Days: 1.5,
  newArticleBoost: 1.5,
  minQualityScore: 50,
  activityWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxActivityHistory: 100,
  weights: {
    view: 1,
    favorite: 3,
  },
  cacheExpiry: {
    userInterests: 300, // 5 minutes
  },
  freshnessWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
  candidateWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// 時間重み計算
export function calculateTimeWeight(timestamp: Date, now: number, windowMs: number): number {
  const timeDiff = now - timestamp.getTime();
  const weight = Math.max(0, 1 - (timeDiff / windowMs));
  return weight;
}

// 記事の新しさブースト
export function calculateFreshnessBoost(publishedAt: Date, windowMs: number): number {
  const now = Date.now();
  const timeDiff = now - publishedAt.getTime();
  
  if (timeDiff > windowMs) {
    return 0;
  }
  
  // 線形減衰: 新しいほど高いブースト
  const boost = 1 - (timeDiff / windowMs);
  return Math.max(0, boost);
}

// タグセットのハッシュ化（多様性確保用）
export function hashTagSet(tags: string[]): string {
  return tags.sort().join(',');
}

// スコアの正規化（0-100）
export function normalizeScore(score: number): number {
  // スコアを0-100の範囲に正規化
  return Math.min(100, Math.max(0, score * 100));
}