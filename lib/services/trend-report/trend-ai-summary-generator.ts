import { PrismaClient, TrendPeriodType } from '@/lib/prisma-exports';
import type { GenerativeModel } from '@google/generative-ai';
import logger from '@/lib/logger';
import { extractFirstJsonObject } from '@/lib/types/trend-ai-summary';
import type {
  ArticleWithRelations,
  TopArticleInfo,
  CategoryInfo,
  TagInfo,
} from './types';
import { LEGACY_SUMMARY_MIN_LENGTH } from './types';
import {
  fetchArticles,
  calculateCategories,
  calculateTags,
} from './trend-data-aggregator';
import {
  PERIOD_LABELS,
  BASIS_LABELS,
  buildStructuredPrompt,
  buildRepairPrompt,
  buildLegacyPrompt,
} from './trend-ai-prompts';
import { validateV2Content, resolveRefKeysToIds } from './trend-ai-validators';

const GEMINI_TIMEOUT_MS = 60_000;

export type AISummaryResult = {
  content: string;
  format: 'json' | 'text';
};

/**
 * Generate AI summary, falling back to legacy plain text on failure.
 */
export async function generateAISummary(
  model: GenerativeModel,
  prisma: PrismaClient,
  periodType: TrendPeriodType,
  periodStart: Date,
  periodEnd: Date,
  articles: ArticleWithRelations[],
  topArticles: TopArticleInfo[],
  categories: CategoryInfo[],
  tags: TagInfo[]
): Promise<AISummaryResult> {
  try {
    const content = await generateAISummaryStructured(
      model,
      prisma,
      periodType,
      periodStart,
      periodEnd,
      articles,
      topArticles,
      categories,
      tags
    );
    return { content, format: 'json' };
  } catch (error) {
    logger.warn(
      { err: error },
      'Failed to generate structured AI summary, falling back to legacy format'
    );
    const content = await generateAISummaryLegacyPlainText(
      model,
      periodType,
      topArticles
    );
    return { content, format: 'text' };
  }
}

// Re-export for external consumers
export { resolveRefKeysToIds } from './trend-ai-validators';

/**
 * Build structured input data including comparison with previous period.
 */
async function buildStructuredInput(
  prisma: PrismaClient,
  periodType: TrendPeriodType,
  periodStart: Date,
  periodEnd: Date,
  articles: ArticleWithRelations[],
  topArticles: TopArticleInfo[],
  categories: CategoryInfo[],
  tags: TagInfo[]
): Promise<Record<string, unknown>> {
  const periodLabel = PERIOD_LABELS[periodType];

  const input: Record<string, unknown> = {
    periodLabel,
    articleCount: articles.length,
    topCategories: categories.slice(0, 8).map((c) => ({
      name: c.name,
      count: c.count,
      percentage: c.percentage,
      topArticleId: c.topArticle?.id ?? null,
    })),
    topTags: tags.slice(0, 12).map((t) => ({
      name: t.name,
      count: t.count,
      percentage: t.percentage,
    })),
    topArticles: topArticles.slice(0, 10).map((a, i) => ({
      ref: `A${i + 1}`,
      id: a.id,
      title: a.translatedTitle || a.title,
      sourceName: a.sourceName,
      url: a.url,
      viewCount: a.viewCount,
      favoriteCount: a.favoriteCount,
      score: a.score,
      tags: a.tags.slice(0, 6),
      detailedSummary: a.detailedSummary?.slice(0, 500) ?? null,
    })),
  };

  // Add comparison data with previous period
  try {
    const durationMs = periodEnd.getTime() - periodStart.getTime();
    const prevStart = new Date(periodStart.getTime() - durationMs);
    const prevEnd = new Date(periodStart);

    const previousArticles = await fetchArticles(prisma, prevStart, prevEnd);
    const previousCategories = calculateCategories(previousArticles);
    const previousTags = calculateTags(previousArticles);

    const toCountMap = (
      items: Array<{ name: string; count: number; percentage: number }>
    ) =>
      new Map(
        items.map(
          (i) => [i.name, { count: i.count, percentage: i.percentage }] as const
        )
      );

    const toDeltaList = (
      today: Array<{ name: string; count: number; percentage: number }>,
      prev: Array<{ name: string; count: number; percentage: number }>
    ) => {
      const prevMap = toCountMap(prev);
      const names = new Set<string>([
        ...today.map((t) => t.name),
        ...prev.map((p) => p.name),
      ]);
      const deltas = Array.from(names).map((name) => {
        const t = today.find((x) => x.name === name);
        const p = prevMap.get(name);
        const todayCount = t?.count ?? 0;
        const prevCount = p?.count ?? 0;
        return {
          name,
          todayCount,
          prevCount,
          deltaCount: todayCount - prevCount,
          todayPercentage: t?.percentage ?? 0,
          prevPercentage: p?.percentage ?? 0,
        };
      });

      const newItems = deltas
        .filter((d) => d.prevCount === 0 && d.todayCount > 0)
        .sort((a, b) => b.todayCount - a.todayCount);
      const rising = deltas
        .filter((d) => d.deltaCount > 0 && d.prevCount > 0)
        .sort((a, b) => b.deltaCount - a.deltaCount);
      const falling = deltas
        .filter((d) => d.deltaCount < 0)
        .sort((a, b) => a.deltaCount - b.deltaCount);

      return { newItems, rising, falling };
    };

    const tagDeltas = toDeltaList(tags, previousTags);
    const categoryDeltas = toDeltaList(categories, previousCategories);

    const basisLabel = BASIS_LABELS[periodType];

    input.comparison = {
      available: previousArticles.length > 0,
      basis: {
        periodLabel: basisLabel,
        periodStart: prevStart.toISOString(),
        periodEnd: prevEnd.toISOString(),
      },
      previous: {
        articleCount: previousArticles.length,
        topCategories: previousCategories.slice(0, 8).map((c) => ({
          name: c.name,
          count: c.count,
          percentage: c.percentage,
        })),
        topTags: previousTags.slice(0, 12).map((t) => ({
          name: t.name,
          count: t.count,
          percentage: t.percentage,
        })),
      },
      tagChanges: {
        new: tagDeltas.newItems.slice(0, 6),
        rising: tagDeltas.rising.slice(0, 6),
        falling: tagDeltas.falling.slice(0, 6),
      },
      categoryChanges: {
        new: categoryDeltas.newItems.slice(0, 6),
        rising: categoryDeltas.rising.slice(0, 6),
        falling: categoryDeltas.falling.slice(0, 6),
      },
    };
  } catch (error) {
    logger.warn(
      { err: error },
      'Failed to build comparison data for AI summary'
    );
    input.comparison = { available: false };
  }

  return input;
}

async function generateAISummaryStructured(
  model: GenerativeModel,
  prisma: PrismaClient,
  periodType: TrendPeriodType,
  periodStart: Date,
  periodEnd: Date,
  articles: ArticleWithRelations[],
  topArticles: TopArticleInfo[],
  categories: CategoryInfo[],
  tags: TagInfo[]
): Promise<string> {
  const periodLabel = PERIOD_LABELS[periodType];
  const input = await buildStructuredInput(
    prisma,
    periodType,
    periodStart,
    periodEnd,
    articles,
    topArticles,
    categories,
    tags
  );
  const prompt = buildStructuredPrompt(periodLabel, input);

  // Build ref key -> actual ID mapping
  const refMap = new Map<string, string>();
  const topArticleSlice = topArticles.slice(0, 10);
  topArticleSlice.forEach((a, i) => {
    refMap.set(`A${i + 1}`, a.id);
  });
  const fallbackId = topArticleSlice[0]?.id;

  const generateOnce = async (promptText: string, temperature: number) => {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature,
          responseMimeType: 'application/json',
        },
      },
      { timeout: GEMINI_TIMEOUT_MS }
    );
    return result.response.text().trim();
  };

  const runAttempt = async (promptText: string, temperature: number) => {
    const rawText = await generateOnce(promptText, temperature);
    const json = extractFirstJsonObject(rawText);
    if (json && typeof json === 'object') {
      resolveRefKeysToIds(json as Record<string, unknown>, refMap, fallbackId);
    }
    const errors = validateV2Content(json);
    return { rawText, json, errors };
  };

  const refMapInfo = Array.from(refMap.entries())
    .map(([ref, id]) => `${ref} -> ${id}`)
    .join(', ');

  // Attempt 1: initial generation (temperature=0.2)
  const {
    rawText: rawText1,
    json: json1,
    errors: errors1,
  } = await runAttempt(prompt, 0.2);
  if (errors1.length === 0) {
    return JSON.stringify(json1);
  }

  // Attempt 2: repair (temperature=0.0)
  const { json: json2, errors: errors2 } = await runAttempt(
    buildRepairPrompt(errors1, rawText1, refMapInfo),
    0.0
  );
  if (errors2.length === 0) {
    return JSON.stringify(json2);
  }

  // Attempt 3: repair failed -> v2 regeneration (temperature=0.0)
  logger.warn(
    `Repair failed (${errors2.join(' / ')}), retrying v2 generation with temperature=0.0`
  );
  const {
    rawText: rawText3,
    json: json3,
    errors: errors3,
  } = await runAttempt(prompt, 0.0);
  if (errors3.length === 0) {
    logger.info('Structured AI summary succeeded on retry (attempt 3)');
    return JSON.stringify(json3);
  }

  // Attempt 4: retry generation also failed -> final repair
  logger.warn(
    `Retry generation failed (${errors3.join(' / ')}), attempting final repair`
  );
  const { json: json4, errors: errors4 } = await runAttempt(
    buildRepairPrompt(errors3, rawText3, refMapInfo),
    0.0
  );
  if (errors4.length > 0) {
    throw new Error(
      `Structured AI summary validation failed after 4 attempts: ${errors4.join(' / ')}`
    );
  }

  logger.info('Structured AI summary succeeded on final repair (attempt 4)');
  return JSON.stringify(json4);
}

async function generateAISummaryLegacyPlainText(
  model: GenerativeModel,
  periodType: TrendPeriodType,
  topArticles: TopArticleInfo[]
): Promise<string> {
  const periodLabel = PERIOD_LABELS[periodType];
  const prompt = buildLegacyPrompt(periodLabel, topArticles);

  const result = await model.generateContent(
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.5,
      },
    },
    { timeout: GEMINI_TIMEOUT_MS }
  );

  const response = result.response;
  let summary = response.text().trim();
  summary = summary.replace(/^(要約[:：]?\s*|##\s*出力\s*)/i, '');

  if (summary.length < LEGACY_SUMMARY_MIN_LENGTH) {
    throw new Error(
      `Legacy AI summary too short (${summary.length} chars), likely incomplete response`
    );
  }

  return summary;
}
