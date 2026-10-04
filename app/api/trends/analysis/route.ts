import { NextRequest, NextResponse } from 'next/server';
import { getTrendAnalysis } from '@/lib/services/trend-analysis';
import { trendsCache } from '@/lib/cache/trends-cache';
import { parseIntParam, VALIDATION_RANGES } from '@/lib/utils/validation';
import logger from '@/lib/logger';
import { applyPublicCacheHeaders } from '@/lib/api/cache-headers';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate days parameter
    const daysParam = parseIntParam(searchParams.get('days'), 30, {
      min: VALIDATION_RANGES.days.min,
      max: VALIDATION_RANGES.days.max,
      paramName: 'days',
    });

    // Return error if validation failed
    if (daysParam.error) {
      return NextResponse.json({ error: daysParam.error }, { status: 400 });
    }

    const days = daysParam.value;
    const tagName = searchParams.get('tag');

    const analysisData = await getTrendAnalysis(days, tagName || undefined);

    // キャッシュ統計を取得
    const cacheStats = trendsCache.getStats();

    const response = NextResponse.json({
      ...analysisData,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats,
      },
    });

    // キャッシュヘッダーも維持（ブラウザキャッシュ用）
    applyPublicCacheHeaders(response.headers, {
      cacheControl: 'public, s-maxage=300, stale-while-revalidate=600',
    });

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Trend analysis error');
    return NextResponse.json(
      { error: 'Failed to fetch trend analysis' },
      { status: 500 }
    );
  }
}
