import { NextRequest, NextResponse } from 'next/server';
import { TrendPeriodType } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report/trend-report-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import { publicCacheHeaders } from '@/lib/api/cache-headers';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import { withVerifiedCategoryTopArticles } from '@/lib/services/trend-report/verify-daily-articles';
import { DAILY_REPORT_NOT_FOUND_ERROR } from '@/lib/constants/daily-trend';

// JST offset constant (+9 hours in milliseconds)
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

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

/**
 * レポートデータにthumbnail情報をenrichする
 * - topArticlesにthumbnailを追加（既存レポートのJSON列にthumbnailがない場合）
 * - aiSummaryのevidenceArticleIds/articleIdsから参照される記事情報をevidenceArticlesとして提供
 */
async function enrichReportWithThumbnails(
  reportData: Record<string, unknown>
): Promise<{
  enrichedData: Record<string, unknown>;
  evidenceArticles: EvidenceArticleMap;
  /** 記事を引き直して確かめられたか。false の応答はキャッシュしない（一時的な失敗を残さないため） */
  verified: boolean;
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

  // Collect all article IDs that need enrichment
  const allArticleIds = new Set<string>();

  // Add topArticle IDs (for thumbnail enrichment of existing reports)
  for (const article of topArticles) {
    allArticleIds.add(article.id);
  }

  // Extract evidenceArticleIds from aiSummary
  if (aiSummaryRaw) {
    try {
      const aiSummary = JSON.parse(aiSummaryRaw);
      // keyTopics.evidenceArticleIds (v1 and v2)
      if (aiSummary.keyTopics) {
        for (const topic of aiSummary.keyTopics) {
          if (topic.evidenceArticleIds) {
            for (const id of topic.evidenceArticleIds) {
              allArticleIds.add(id);
            }
          }
        }
      }
      // actions.articleIds (v2) or actions.relatedArticleIds (v1)
      if (aiSummary.actions) {
        for (const action of aiSummary.actions) {
          const ids = action.articleIds || action.relatedArticleIds || [];
          for (const id of ids) {
            allArticleIds.add(id);
          }
        }
      }
    } catch {
      // aiSummary parse failure - skip evidence enrichment
    }
  }

  // カテゴリの代表記事も、表示してよいかを引き直して確かめる
  if (Array.isArray(reportData.categories)) {
    for (const category of reportData.categories) {
      const id = (category as { topArticle?: { id?: unknown } | null })
        ?.topArticle?.id;
      if (typeof id === 'string') {
        allArticleIds.add(id);
      }
    }
  }

  if (allArticleIds.size === 0) {
    const { detailedSummary: _ds, ...clean } = reportData as Record<
      string,
      unknown
    > & { detailedSummary?: unknown };
    return { enrichedData: clean, evidenceArticles: {}, verified: true };
  }

  // Fetch article data from DB (sourceName is via source relation)
  let articles: Array<{
    id: string;
    title: string;
    translatedTitle: string | null;
    thumbnail: string | null;
    source: { name: string };
  }> = [];
  try {
    articles = await prisma.article.findMany({
      // 無効化したソースの記事は出さない（issue #688）。保存済みのレポートは作り直さず、表示の時点で除く
      where: {
        id: { in: Array.from(allArticleIds) },
        isHidden: false,
        AND: [enabledSourceWhere()],
      },
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
    // 確かめられなかった記事は出さない（無効化したソースの記事が混ざりうるため。issue #688）
    return {
      enrichedData: {
        ...clean,
        topArticles: [],
        categories: withVerifiedCategoryTopArticles(
          clean.categories,
          new Set()
        ),
      },
      evidenceArticles: {},
      verified: false,
    };
  }

  const articleMap = new Map(
    articles.map((a) => [a.id, { ...a, sourceName: a.source.name }])
  );

  // Enrich topArticles with thumbnails and strip detailedSummary (AI input only).
  // 引き直した記事に無い ID（非表示・無効化したソース・削除済み）は落とす
  const enrichedTopArticles = topArticles
    .filter((article) => articleMap.has(article.id))
    .map((article) => {
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

  // Build evidenceArticles map (all fetched articles, for FE to look up by ID)
  const evidenceArticles: EvidenceArticleMap = {};
  for (const [id, article] of articleMap) {
    evidenceArticles[id] = {
      title: article.title,
      translatedTitle: article.translatedTitle,
      thumbnail: article.thumbnail,
      sourceName: article.sourceName,
    };
  }

  // detailedSummary is for AI input only, strip from API response
  const { detailedSummary: _ds, ...cleanReportData } = reportData as Record<
    string,
    unknown
  > & { detailedSummary?: unknown };
  const enrichedData = {
    ...cleanReportData,
    topArticles: enrichedTopArticles,
    categories: withVerifiedCategoryTopArticles(
      cleanReportData.categories,
      new Set(articleMap.keys())
    ),
  };

  return {
    enrichedData,
    evidenceArticles,
    verified: true,
  };
}

/**
 * GET /api/trends/daily
 * 日間トレンドレポートを取得
 *
 * Query Parameters:
 * - date: YYYY-MM-DD形式（オプション、デフォルト: 前日）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    // 日付パラメータの処理
    let targetDate: Date;
    if (dateParam) {
      const parsed = new Date(dateParam + 'T00:00:00+09:00'); // JST
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }
      targetDate = parsed;
    } else {
      // デフォルト: 前日（JST基準）
      // 現在時刻をJSTに変換し、1日引いて00:00:00に設定し、UTCに戻す
      const now = new Date();
      const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
      jstNow.setUTCDate(jstNow.getUTCDate() - 1);
      jstNow.setUTCHours(0, 0, 0, 0);
      targetDate = new Date(jstNow.getTime() - JST_OFFSET_MS);
    }

    // JST日付（periodStart計算用）
    const jstDate = new Date(targetDate.getTime() + JST_OFFSET_MS);
    // 日付文字列（キャッシュキー用）
    const dateKey = toJSTDateString(targetDate);

    // キャッシュチェック
    const cacheInstance = getCache();
    const cacheKey = cacheInstance.generateCacheKey('daily', {
      params: { date: dateKey },
    });

    try {
      const cached = await cacheInstance.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'X-Cache': 'HIT',
            ...publicCacheHeaders({ cacheControl: 'public, max-age=300' }),
          },
        });
      }
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache read error');
    }

    // レポート取得（日付指定でフィルタリング）
    const generator = new TrendReportGenerator(prisma);

    // periodStartを計算（JST 00:00:00をUTCに変換）
    const periodStart = new Date(jstDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodStartUTC = new Date(periodStart.getTime() - JST_OFFSET_MS);

    // 指定日付のレポートを取得
    const report = await generator.getTrendReport(
      TrendPeriodType.DAILY,
      periodStartUTC
    );

    if (!report) {
      // 指定日付のレポートがない場合、最新レポートへフォールバック
      const latestReport = await generator.getLatestReport(
        TrendPeriodType.DAILY
      );

      if (!latestReport) {
        // レポートが一切存在しない場合は404
        return NextResponse.json(
          {
            error: DAILY_REPORT_NOT_FOUND_ERROR,
            requestedDate: dateKey,
            latestAvailableDate: null,
          },
          { status: 404 }
        );
      }

      // 最新レポートの日付でナビゲーション情報を取得
      const fallbackAdjacentDates = await generator.getAdjacentReportDates(
        TrendPeriodType.DAILY,
        latestReport.periodStart
      );

      const actualDate = toJSTDateString(latestReport.periodStart);

      // Enrich fallback with thumbnails
      const {
        enrichedData: enrichedFallbackData,
        evidenceArticles: fallbackEvidenceArticles,
        verified: fallbackVerified,
      } = await enrichReportWithThumbnails({
        ...latestReport,
        periodStart: latestReport.periodStart.toISOString(),
        periodEnd: latestReport.periodEnd.toISOString(),
        generatedAt: latestReport.generatedAt?.toISOString(),
      });

      const fallbackResponse = {
        success: true,
        isFallback: true,
        requestedDate: dateKey,
        actualDate,
        data: enrichedFallbackData,
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

      // フォールバックレスポンスはリクエスト日付のキーではキャッシュしない
      // （実際の日付のキーは通常フローでキャッシュ済みのはず）

      // 記事を確かめられなかった応答は、ブラウザや CDN にも残さない（issue #688）
      return NextResponse.json(fallbackResponse, {
        headers: fallbackVerified
          ? {
              'X-Cache': 'MISS',
              // フォールバックは短めのTTL
              ...publicCacheHeaders({ cacheControl: 'public, max-age=60' }),
            }
          : { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
      });
    }

    // 前後のレポート日付を取得
    const adjacentDates = await generator.getAdjacentReportDates(
      TrendPeriodType.DAILY,
      report.periodStart
    );

    // Enrich with thumbnails
    const { enrichedData, evidenceArticles, verified } =
      await enrichReportWithThumbnails({
        ...report,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        generatedAt: report.generatedAt?.toISOString(),
      });

    const response = {
      success: true,
      data: enrichedData,
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

    // 記事を確かめられなかった応答は、キャッシュに残さない（issue #688）
    if (!verified) {
      return NextResponse.json(response, {
        headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
      });
    }

    // キャッシュ保存
    try {
      await cacheInstance.set(cacheKey, response);
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache write error');
    }

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        ...publicCacheHeaders({ cacheControl: 'public, max-age=300' }),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get daily trend report');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trends/daily
 * 日間トレンドレポートを生成（管理者またはcronのみ）
 *
 * Body:
 * - date: YYYY-MM-DD形式（オプション、デフォルト: 前日）
 */
async function generateDailyReportHandler(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dateParam = body.date;

    // 日付パラメータの処理
    let targetDate: Date;
    if (dateParam) {
      const parsed = new Date(dateParam + 'T00:00:00+09:00'); // JST
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 }
        );
      }
      targetDate = parsed;
    } else {
      // デフォルト: 前日（JST基準）
      // 現在時刻をJSTに変換し、1日引いて00:00:00に設定し、UTCに戻す
      const now = new Date();
      const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
      jstNow.setUTCDate(jstNow.getUTCDate() - 1);
      jstNow.setUTCHours(0, 0, 0, 0);
      targetDate = new Date(jstNow.getTime() - JST_OFFSET_MS);
    }

    // レポート生成
    const generator = new TrendReportGenerator(prisma);
    const reportId = await generator.generateDailyReport(targetDate);

    // キャッシュ無効化
    const cacheInstance = getCache();
    try {
      // 日付ベースのキャッシュをクリア
      const dateKey = toJSTDateString(targetDate);
      const cacheKey = cacheInstance.generateCacheKey('daily', {
        params: { date: dateKey },
      });
      await cacheInstance.del(cacheKey);
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache invalidation error');
    }

    return NextResponse.json({
      success: true,
      reportId,
      message: 'Daily trend report generated successfully',
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate daily trend report');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// withCronOrAdminAuthでラップしてエクスポート
export const POST = withCronOrAdminAuth(generateDailyReportHandler);
