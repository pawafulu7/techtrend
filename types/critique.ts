export interface ArticleCritique {
  contextComparison: string;
  recommendedAudience: string;
  valueAssessment: string;
  updatedAt: string;
}

export function isArticleCritique(value: unknown): value is ArticleCritique {
  if (!value || typeof value !== 'object') return false;

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.contextComparison === 'string' &&
    typeof obj.recommendedAudience === 'string' &&
    typeof obj.valueAssessment === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}
