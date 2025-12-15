import { NextRequest, NextResponse } from 'next/server';
import { TrendPeriodType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TrendReportGenerator } from '@/lib/services/trend-report-generator';
import { RedisCache } from '@/lib/cache';
import logger from '@/lib/logger/index';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';

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
      // デフォルト: 前日（JST）
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstNow = new Date(now.getTime() + jstOffset);
      jstNow.setUTCDate(jstNow.getUTCDate() - 1);
      targetDate = jstNow;
    }

    // 日付文字列（キャッシュキー用）
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(targetDate.getTime() + jstOffset);
    const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;

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

    // レポート取得
    const generator = new TrendReportGenerator(prisma);
    const report = await generator.getLatestReport(TrendPeriodType.DAILY);

    if (!report) {
      return NextResponse.json(
        { error: 'No daily trend report found', date: dateKey },
        { status: 404 }
      );
    }

    const response = {
      success: true,
      data: {
        ...report,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        generatedAt: report.generatedAt?.toISOString()
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
      // デフォルト: 前日（JST）
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstNow = new Date(now.getTime() + jstOffset);
      jstNow.setUTCDate(jstNow.getUTCDate() - 1);
      targetDate = jstNow;
    }

    // レポート生成
    const generator = new TrendReportGenerator(prisma);
    const reportId = await generator.generateDailyReport(targetDate);

    // キャッシュ無効化
    const cacheInstance = getCache();
    try {
      // 日付ベースのキャッシュをクリア
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstDate = new Date(targetDate.getTime() + jstOffset);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
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
