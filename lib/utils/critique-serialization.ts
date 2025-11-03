import { Prisma } from '@prisma/client';

export function critiqueToJson(
  critique:
    | {
        contextComparison: string;
        recommendedAudience: string;
        valueAssessment: string;
        updatedAt: string;
      }
    | undefined
): Prisma.JsonValue | null {
  if (!critique) return null;

  return {
    contextComparison: critique.contextComparison,
    recommendedAudience: critique.recommendedAudience,
    valueAssessment: critique.valueAssessment,
    updatedAt: critique.updatedAt,
  } as Prisma.JsonValue;
}
