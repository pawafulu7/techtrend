import { prisma } from '@/lib/prisma';
import { BatchStatus } from '@/lib/prisma-exports';
import { getPreviousISOWeek } from '@/lib/ai/diff-summary';
import {
  SOURCE_CATEGORIES,
  SourceCategoryId,
} from '@/lib/constants/source-categories';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import type { DiffSummaryResponse } from './diff-utils';

export async function fetchInitialDiffData(
  week: string
): Promise<DiffSummaryResponse> {
  const summaries = await prisma.diffSummary.findMany({
    where: { currentPeriod: week, status: BatchStatus.SUCCESS },
    orderBy: { generatedAt: 'desc' },
  });

  const mapSummary = (s: {
    categorySlug: string;
    currentPeriod: string;
    baselinePeriod: string;
    changes: unknown;
    unchanged: unknown;
    modelVersion: string;
    promptVersion: string;
    generatedAt: Date;
  }) => ({
    categorySlug: s.categorySlug,
    categoryName:
      SOURCE_CATEGORIES[s.categorySlug as SourceCategoryId]?.name ||
      s.categorySlug,
    currentPeriod: s.currentPeriod,
    baselinePeriod: s.baselinePeriod,
    changes: s.changes as DiffChange[],
    unchanged: s.unchanged as string[],
    modelVersion: s.modelVersion,
    promptVersion: s.promptVersion,
    generatedAt: s.generatedAt.toISOString(),
  });

  if (summaries.length > 0) {
    return {
      success: true,
      week,
      previousWeek: getPreviousISOWeek(week),
      data: summaries.map(mapSummary),
      meta: {
        totalCategories: Object.keys(SOURCE_CATEGORIES).length,
        summarizedCategories: summaries.length,
      },
    };
  }

  // Fallback: find latest available week
  const latestRecord = await prisma.diffSummary.findFirst({
    where: { status: BatchStatus.SUCCESS },
    orderBy: { currentPeriod: 'desc' },
    select: { currentPeriod: true },
  });

  if (!latestRecord) {
    return {
      success: true,
      week,
      previousWeek: getPreviousISOWeek(week),
      data: [],
      meta: {
        totalCategories: Object.keys(SOURCE_CATEGORIES).length,
        summarizedCategories: 0,
      },
    };
  }

  const fallbackWeek = latestRecord.currentPeriod;
  const fallbackSummaries = await prisma.diffSummary.findMany({
    where: { currentPeriod: fallbackWeek, status: BatchStatus.SUCCESS },
    orderBy: { generatedAt: 'desc' },
  });

  if (fallbackSummaries.length === 0) {
    // TOCTOUガード: findFirstで見つけた週のデータが消えた場合
    return {
      success: true,
      data: [],
      week: week,
      previousWeek: getPreviousISOWeek(week),
      isFallback: false,
      meta: {
        totalCategories: Object.keys(SOURCE_CATEGORIES).length,
        summarizedCategories: 0,
      },
    };
  }

  return {
    success: true,
    week: fallbackWeek,
    previousWeek: getPreviousISOWeek(fallbackWeek),
    isFallback: true,
    requestedWeek: week,
    data: fallbackSummaries.map(mapSummary),
    meta: {
      totalCategories: Object.keys(SOURCE_CATEGORIES).length,
      summarizedCategories: fallbackSummaries.length,
    },
  };
}
