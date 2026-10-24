import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { publicCacheHeaders } from '@/lib/api/cache-headers';
import { DAILY_REPORT_NOT_FOUND_ERROR } from '@/lib/constants/daily-trend';
import {
  getDailyTrendReport,
  previousJSTDay,
} from '@/lib/services/trend-report/daily-report';

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
      targetDate = previousJSTDay();
    }

    const result = await getDailyTrendReport(targetDate);

    if (result.kind === 'not-found') {
      // レポートが一切存在しない場合は404
      return NextResponse.json(
        {
          error: DAILY_REPORT_NOT_FOUND_ERROR,
          requestedDate: result.requestedDate,
          latestAvailableDate: null,
        },
        { status: 404 }
      );
    }

    if (result.kind === 'fallback') {
      // 記事を確かめられなかった応答は、ブラウザや CDN にも残さない（issue #688）
      return NextResponse.json(result.response, {
        headers: result.verified
          ? {
              'X-Cache': 'MISS',
              // フォールバックは短めのTTL
              ...publicCacheHeaders({ cacheControl: 'public, max-age=60' }),
            }
          : { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
      });
    }

    // 記事を確かめられなかった応答は、キャッシュに残さない（issue #688）
    if (!result.verified) {
      return NextResponse.json(result.response, {
        headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(result.response, {
      headers: {
        'X-Cache': result.fromCache ? 'HIT' : 'MISS',
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
