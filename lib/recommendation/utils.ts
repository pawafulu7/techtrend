import { RecommendationConfig } from './types';

// デフォルト設定
export const defaultConfig: RecommendationConfig = {
  maxRecommendations: 20,
  maxPerSource: 3,
  maxSameTagSet: 2,
  viewWeight: 1,
  favoriteWeight: 3,
  recentBoost7Days: 2,
  recentBoost30Days: 1.5,
  newArticleBoost: 1.5,
  minQualityScore: 50,
};

// 時間重み計算
export function calculateTimeWeight(timestamp: Date, now: Date = new Date()): number {
  const daysDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 7) {
    return defaultConfig.recentBoost7Days;
  } else if (daysDiff <= 30) {
    return defaultConfig.recentBoost30Days;
  }
  return 1;
}

// 記事の新しさブースト
export function calculateFreshnessBoost(publishedAt: Date, now: Date = new Date()): number {
  const hoursDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff <= 24) {
    return defaultConfig.newArticleBoost;
  }
  return 1;
}

// タグセットのハッシュ化（多様性確保用）
export function hashTagSet(tags: string[]): string {
  return tags.sort().join(',');
}

// スコアの正規化（0-1）
export function normalizeScore(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.min(1, Math.max(0, score / maxScore));
}