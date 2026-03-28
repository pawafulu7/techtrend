import { TrendPeriodType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report/trend-report-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import {
  JST_OFFSET_MS,
  TrendReportData,
} from '@/lib/services/trend-report/types';

export type { TrendReportData };

/**
 * UTC DateをJST日付文字列（YYYY-MM-DD）に変換
 */
function toJSTDateString(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

// キャッシュインスタンスを遅延初期化
let cache: RedisCache | null = null;

const getCache = () => {
  if (!cache) {
    cache = new RedisCache({
      ttl: 3600, // 1時間
      namespace: '@techtrend/cache:trend',
    });
  }
  return cache;
};

export interface DailyTrendResponse {
  success: boolean;
  data?: TrendReportData;
  navigation?: {
    prevDate: string | null;
    nextDate: string | null;
  };
  evidenceArticles?: EvidenceArticleMap;
  error?: string;
  latestAvailableDate?: string | null;
  isFallback?: boolean;
  requestedDate?: string;
  actualDate?: string;
}

/**
 * レポートデータにthumbnail情報をenrichする
 */
async function enrichReportWithThumbnails(
  reportData: Record<string, unknown>
): Promise<{
  enrichedData: Record<string, unknown>;
  evidenceArticles: EvidenceArticleMap;
}> {
  const topArticlesRaw = reportData.topArticles;
  const topArticles: Array<{ id: string; thumbnail?: string | null }> =
    Array.isArray(topArticlesRaw)
      ? topArticlesRaw.filter(
          (a): a is { id: string; thumbnail?: string | null } =>
            Boolean(a) &&
            typeof a === 'object' &&
            typeof (a as { id?: unknown }).id === 'string'
        )
      : [];
  const aiSummaryRaw = reportData.aiSummary as string | undefined;

  const allArticleIds = new Set<string>();

  for (const article of topArticles) {
    allArticleIds.add(article.id);
  }

  if (aiSummaryRaw) {
    try {
      const aiSummary = JSON.parse(aiSummaryRaw);
      if (aiSummary.keyTopics) {
        for (const topic of aiSummary.keyTopics) {
          if (topic.evidenceArticleIds) {
            for (const id of topic.evidenceArticleIds) {
              allArticleIds.add(id);
            }
          }
        }
      }
      if (aiSummary.actions) {
        for (const action of aiSummary.actions) {
          const ids = action.articleIds || action.relatedArticleIds || [];
          for (const id of ids) {
            allArticleIds.add(id);
          }
        }
      }
    } catch (e) {
      logger.debug({ error: e }, 'Failed to parse aiSummary');
    }
  }

  if (allArticleIds.size === 0) {
    const { detailedSummary: _ds, ...clean } = reportData as Record<
      string,
      unknown
    > & { detailedSummary?: unknown };
    return { enrichedData: clean, evidenceArticles: {} };
  }

  let articles: Array<{
    id: string;
    title: string;
    translatedTitle: string | null;
    thumbnail: string | null;
    source: { name: string };
  }> = [];
  try {
    articles = await prisma.article.findMany({
      where: { id: { in: Array.from(allArticleIds) }, isHidden: false },
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        thumbnail: true,
        source: { select: { name: true } },
      },
    });
  } catch (error) {
    logger.warn(
      { err: error },
      'Failed to fetch articles for thumbnail enrichment'
    );
    const { detailedSummary: _ds2, ...clean } = reportData as Record<
      string,
      unknown
    > & { detailedSummary?: unknown };
    return { enrichedData: clean, evidenceArticles: {} };
  }

  const articleMap = new Map(
    articles.map((a) => [a.id, { ...a, sourceName: a.source.name }])
  );

  const enrichedTopArticles = topArticles.map((article) => {
    const { detailedSummary: _ignored, ...rest } = article as Record<
      string,
      unknown
    >;
    if (rest.thumbnail !== undefined) {
      return rest;
    }
    const dbArticle = articleMap.get(rest.id as string);
    return { ...rest, thumbnail: dbArticle?.thumbnail ?? null };
  });

  const evidenceArticles: EvidenceArticleMap = {};
  for (const [id, article] of articleMap) {
    evidenceArticles[id] = {
      title: article.title,
      translatedTitle: article.translatedTitle,
      thumbnail: article.thumbnail,
      sourceName: article.sourceName,
    };
  }

  const { detailedSummary: _ds, ...cleanReportData } = reportData as Record<
    string,
    unknown
  > & { detailedSummary?: unknown };
  const enrichedData = { ...cleanReportData, topArticles: enrichedTopArticles };

  return {
    enrichedData,
    evidenceArticles,
  };
}

/**
 * 日間トレンドレポートの初期データを取得（Server Component用）
 */
export async function fetchInitialDailyData(): Promise<DailyTrendResponse> {
  try {
    // デフォルト: 前日（JST基準）
    const now = new Date();
    const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
    jstNow.setUTCDate(jstNow.getUTCDate() - 1);
    jstNow.setUTCHours(0, 0, 0, 0);
    const targetDate = new Date(jstNow.getTime() - JST_OFFSET_MS);

    const jstDate = new Date(targetDate.getTime() + JST_OFFSET_MS);
    const dateKey = toJSTDateString(targetDate);

    // キャッシュチェック
    const cacheInstance = getCache();
    const cacheKey = cacheInstance.generateCacheKey('daily', {
      params: { date: dateKey },
    });

    try {
      const cached = await cacheInstance.get<DailyTrendResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache read error');
    }

    const generator = new TrendReportGenerator(prisma);

    // periodStartを計算（JST 00:00:00をUTCに変換）
    const periodStart = new Date(jstDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodStartUTC = new Date(periodStart.getTime() - JST_OFFSET_MS);

    const report = await generator.getTrendReport(
      TrendPeriodType.DAILY,
      periodStartUTC
    );

    if (!report) {
      // フォールバック: 最新レポート
      const latestReport = await generator.getLatestReport(
        TrendPeriodType.DAILY
      );

      if (!latestReport) {
        return {
          success: false,
          error: 'No report found for this date',
          latestAvailableDate: null,
        };
      }

      const fallbackAdjacentDates = await generator.getAdjacentReportDates(
        TrendPeriodType.DAILY,
        latestReport.periodStart
      );

      const actualDate = toJSTDateString(latestReport.periodStart);

      const {
        enrichedData: enrichedFallbackData,
        evidenceArticles: fallbackEvidenceArticles,
      } = await enrichReportWithThumbnails({
        ...latestReport,
        periodStart: latestReport.periodStart.toISOString(),
        periodEnd: latestReport.periodEnd.toISOString(),
        generatedAt: latestReport.generatedAt?.toISOString(),
      });

      return {
        success: true,
        isFallback: true,
        requestedDate: dateKey,
        actualDate,
        data: enrichedFallbackData as unknown as TrendReportData,
        evidenceArticles: fallbackEvidenceArticles,
        navigation: {
          prevDate: fallbackAdjacentDates.prevDate
            ? toJSTDateString(fallbackAdjacentDates.prevDate)
            : null,
          nextDate: fallbackAdjacentDates.nextDate
            ? toJSTDateString(fallbackAdjacentDates.nextDate)
            : null,
        },
      };
    }

    const adjacentDates = await generator.getAdjacentReportDates(
      TrendPeriodType.DAILY,
      report.periodStart
    );

    const { enrichedData, evidenceArticles } = await enrichReportWithThumbnails(
      {
        ...report,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        generatedAt: report.generatedAt?.toISOString(),
      }
    );

    const response: DailyTrendResponse = {
      success: true,
      data: enrichedData as unknown as TrendReportData,
      evidenceArticles,
      navigation: {
        prevDate: adjacentDates.prevDate
          ? toJSTDateString(adjacentDates.prevDate)
          : null,
        nextDate: adjacentDates.nextDate
          ? toJSTDateString(adjacentDates.nextDate)
          : null,
      },
    };

    try {
      await cacheInstance.set(cacheKey, response);
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache write error');
    }

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Failed to get daily trend report (SC)');
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}
