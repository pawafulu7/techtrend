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
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (!critique) return Prisma.DbNull;

  return {
    contextComparison: critique.contextComparison,
    recommendedAudience: critique.recommendedAudience,
    valueAssessment: critique.valueAssessment,
    updatedAt: critique.updatedAt,
  } satisfies Prisma.InputJsonObject;
}
