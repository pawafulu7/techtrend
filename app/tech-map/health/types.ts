export interface AxisResult {
  value: number;
  available: boolean;
}

export interface HealthScoreResult {
  entityId: string;
  entityName: string;
  entityType: string;
  axes: Record<keyof typeof HEALTH_AXIS_LABELS, AxisResult>;
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
  articleAttention: 0.35,
  adoptionBreadth: 0.25,
  communityActivity: 0.2,
  developmentVelocity: 0.2,
} as const;

export const HEALTH_AXIS_LABELS = {
  communityActivity: 'Community',
  developmentVelocity: 'Dev Velocity',
  articleAttention: 'Article Attention',
  adoptionBreadth: 'Adoption',
} as const;
