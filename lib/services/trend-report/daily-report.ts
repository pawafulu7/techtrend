import { TrendPeriodType } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report/trend-report-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import { enabledSourceWhere } from '@/lib/database/enabled-source-filter';
import { withVerifiedCategoryTopArticles } from '@/lib/services/trend-report/verify-daily-articles';
import {
  JST_OFFSET_MS,
  type TrendReportData,
} from '@/lib/services/trend-report/types';

/**
 * 日間トレンドレポートの読み出し。/api/trends/daily（日付の切り替え）と /trends/daily の
 * 初期表示（Server Component）が同じ処理・同じキャッシュを使う
 */

/**
 * クライアントに渡すレポート。日時は ISO 文字列（toISOString()）で渡すので、型も string にする。
 * 以前は Date 型のまま渡していて、実際の値（文字列）と食い違っていた
 */
export type SerializedTrendReport = Omit<
  TrendReportData,
  'periodStart' | 'periodEnd' | 'generatedAt'
> & {
  periodStart: string;
  periodEnd: string;
  generatedAt?: string;
};

export interface DailyTrendResponse {
  success: boolean;
  data?: SerializedTrendReport;
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

export type DailyTrendResult =
  /** 指定日のレポート。fromCache はキャッシュから返したとき */
  | {
      kind: 'found';
      response: DailyTrendResponse;
      verified: boolean;
      fromCache: boolean;
    }
  /** 指定日のレポートが無く、最新のレポートを返したとき（キャッシュしない） */
  | { kind: 'fallback'; response: DailyTrendResponse; verified: boolean }
  /** レポートが1件も無い */
  | { kind: 'not-found'; requestedDate: string };

/**
 * UTC DateをJST日付文字列（YYYY-MM-DD）に変換
 */
export function toJSTDateString(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 前日（JST基準）の 00:00 を UTC で返す。日付の指定が無いときの既定
 */
export function previousJSTDay(now: Date = new Date()): Date {
  // 現在時刻をJSTに変換し、1日引いて00:00:00に設定し、UTCに戻す
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  jstNow.setUTCDate(jstNow.getUTCDate() - 1);
  jstNow.setUTCHours(0, 0, 0, 0);
  return new Date(jstNow.getTime() - JST_OFFSET_MS);
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
    } catch (e) {
      // aiSummary parse failure - skip evidence enrichment
      logger.debug({ err: e }, 'Failed to parse aiSummary');
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

function toNavigation(adjacentDates: {
  prevDate: Date | null;
  nextDate: Date | null;
}): DailyTrendResponse['navigation'] {
  return {
    prevDate: adjacentDates.prevDate
      ? toJSTDateString(adjacentDates.prevDate)
      : null,
    nextDate: adjacentDates.nextDate
      ? toJSTDateString(adjacentDates.nextDate)
      : null,
  };
}

function serializeReport(report: TrendReportData): Record<string, unknown> {
  return {
    ...report,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    generatedAt: report.generatedAt?.toISOString(),
  };
}

/**
 * 指定日（targetDate を含む JST の暦日）の日間トレンドレポートを読む。
 * 記事を確かめられたレポートだけを日付のキーでキャッシュする（issue #688）
 */
export async function getDailyTrendReport(
  targetDate: Date
): Promise<DailyTrendResult> {
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
    const cached = await cacheInstance.get<DailyTrendResponse>(cacheKey);
    if (cached) {
      return { kind: 'found', response: cached, verified: true, fromCache: true };
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
    const latestReport = await generator.getLatestReport(TrendPeriodType.DAILY);

    if (!latestReport) {
      return { kind: 'not-found', requestedDate: dateKey };
    }

    // 最新レポートの日付でナビゲーション情報を取得
    const fallbackAdjacentDates = await generator.getAdjacentReportDates(
      TrendPeriodType.DAILY,
      latestReport.periodStart
    );

    const { enrichedData, evidenceArticles, verified } =
      await enrichReportWithThumbnails(serializeReport(latestReport));

    // フォールバックレスポンスはリクエスト日付のキーではキャッシュしない
    // （実際の日付のキーは通常フローでキャッシュ済みのはず）
    return {
      kind: 'fallback',
      verified,
      response: {
        success: true,
        isFallback: true,
        requestedDate: dateKey,
        actualDate: toJSTDateString(latestReport.periodStart),
        data: enrichedData as SerializedTrendReport,
        evidenceArticles,
        navigation: toNavigation(fallbackAdjacentDates),
      },
    };
  }

  // 前後のレポート日付を取得
  const adjacentDates = await generator.getAdjacentReportDates(
    TrendPeriodType.DAILY,
    report.periodStart
  );

  const { enrichedData, evidenceArticles, verified } =
    await enrichReportWithThumbnails(serializeReport(report));

  const response: DailyTrendResponse = {
    success: true,
    data: enrichedData as SerializedTrendReport,
    evidenceArticles,
    navigation: toNavigation(adjacentDates),
  };

  // 記事を確かめられなかった応答は、キャッシュに残さない（issue #688）
  if (verified) {
    try {
      await cacheInstance.set(cacheKey, response);
    } catch (cacheError) {
      logger.warn({ err: cacheError }, 'Cache write error');
    }
  }

  return { kind: 'found', response, verified, fromCache: false };
}
