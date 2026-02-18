import type { TechMaturityStage } from '@prisma/client';

export type { TechMaturityStage };

export interface TrendScoreComponents {
  articleMentionGrowth: number;
  githubStarsGrowth: number;
  npmDownloadsGrowth: number;
  soQuestionsGrowth: number;
}

export interface TrendScoreResult {
  entityId: string;
  entityName: string;
  entityType: string;
  score: number;
  components: TrendScoreComponents;
  stage: TechMaturityStage;
  calculatedAt: string;
}

export interface HealthMetrics {
  entityId: string;
  entityName: string;
  communityActivity: number;
  developmentVelocity: number;
  articleAttention: number;
  adoptionBreadth: number;
  overallHealth: number;
}

export const STAGE_THRESHOLDS = {
  ESTABLISHED_MENTION_COUNT: 50,
  DECLINING_ARTICLE_GROWTH: -10,
  RISING_ARTICLE_GROWTH: 20,
  RISING_EXTERNAL_GROWTH: 10,
  EMERGING_MAX_AGE_DAYS: 90,
} as const;

export const SCORE_WEIGHTS = {
  ARTICLE_MENTION: 0.35,
  GITHUB_STARS: 0.25,
  NPM_DOWNLOADS: 0.25,
  SO_QUESTIONS: 0.15,
} as const;

export interface ScoreHistoryPoint {
  calculatedAt: string;
  score: number;
}

export const GROWTH_RATE_CLIP = {
  MIN: -100,
  MAX: 500,
} as const;
