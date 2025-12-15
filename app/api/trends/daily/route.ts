import { NextRequest, NextResponse } from 'next/server';
import { TrendPeriodType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger/index';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';

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
      namespace: '@techtrend/cache:trend'
    });
  }
  return cache;
};

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

    // 日付文字列（キャッシュキー用）- targetDateはUTCなのでJSTに変換
    const jstDate = new Date(targetDate.getTime() + JST_OFFSET_MS);
    const dateKey = toJSTDateString(targetDate);

    // キャッシュチェック
    const cacheInstance = getCache();
    const cacheKey = cacheInstance.generateCacheKey('daily', { params: { date: dateKey } });

    try {
      const cached = await cacheInstance.get<object>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'X-Cache': 'HIT',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }
    } catch (cacheError) {
      logger.warn('Cache read error', cacheError);
    }

    // レポート取得（日付指定でフィルタリング）
    const generator = new TrendReportGenerator(prisma);

    // periodStartを計算（JST 00:00:00をUTCに変換）
    const periodStart = new Date(jstDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodStartUTC = new Date(periodStart.getTime() - JST_OFFSET_MS);

    // 指定日付のレポートを取得
    const report = await generator.getTrendReport(TrendPeriodType.DAILY, periodStartUTC);

    if (!report) {
      // 指定日付のレポートがない場合、404を返す（フォールバックしない）
      const latestDate = await generator.getLatestReportDate(TrendPeriodType.DAILY);

      return NextResponse.json(
        {
          error: 'No report found for this date',
          requestedDate: dateKey,
          latestAvailableDate: latestDate ? toJSTDateString(latestDate) : null
        },
        { status: 404 }
      );
    }

    // 前後のレポート日付を取得
    const adjacentDates = await generator.getAdjacentReportDates(
      TrendPeriodType.DAILY,
      report.periodStart
    );

    const response = {
      success: true,
      data: {
        ...report,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        generatedAt: report.generatedAt?.toISOString()
      },
      navigation: {
        prevDate: adjacentDates.prevDate ? toJSTDateString(adjacentDates.prevDate) : null,
        nextDate: adjacentDates.nextDate ? toJSTDateString(adjacentDates.nextDate) : null
      }
    };

    // キャッシュ保存
    try {
      await cacheInstance.set(cacheKey, response);
    } catch (cacheError) {
      logger.warn('Cache write error', cacheError);
    }

    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    logger.error('Failed to get daily trend report', error);
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
      const cacheKey = cacheInstance.generateCacheKey('daily', { params: { date: dateKey } });
      await cacheInstance.del(cacheKey);
    } catch (cacheError) {
      logger.warn('Cache invalidation error', cacheError);
    }

    return NextResponse.json({
      success: true,
      reportId,
      message: 'Daily trend report generated successfully'
    });
  } catch (error) {
    logger.error('Failed to generate daily trend report', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// withCronOrAdminAuthでラップしてエクスポート
export const POST = withCronOrAdminAuth(generateDailyReportHandler);
