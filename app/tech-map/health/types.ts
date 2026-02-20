export interface AxisResult {
  value: number;
  available: boolean;
}

export interface HealthScoreResult {
  entityId: string;
  entityName: string;
  entityType: string;
  axes: {
    communityActivity: number;
    developmentVelocity: number;
    articleAttention: number;
    adoptionBreadth: number;
  };
  overallHealth: number;
  calculatedAt: string;
}

export interface HealthHistoryPoint {
  calculatedAt: string;
  communityActivity: number;
  developmentVelocity: number;
  articleAttention: number;
  adoptionBreadth: number;
  overallHealth: number;
}

export interface RadarDataPoint {
  axis: string;
  value: number;
  fullMark: number;
}

export const HEALTH_WEIGHTS = {
  ARTICLE_ATTENTION: 0.3,
  ADOPTION_BREADTH: 0.25,
  COMMUNITY_ACTIVITY: 0.25,
  DEVELOPMENT_VELOCITY: 0.2,
} as const;

export const HEALTH_AXIS_LABELS = {
  communityActivity: 'Community',
  developmentVelocity: 'Dev Velocity',
  articleAttention: 'Article Attention',
  adoptionBreadth: 'Adoption',
} as const;
