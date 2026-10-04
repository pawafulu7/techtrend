import { getTrendingKeywords } from '@/lib/services/trending-keywords';
import { NextResponse } from 'next/server';
import { keywordsCache } from '@/lib/cache/keywords-cache';

export async function GET() {
  try {
    const keywordsData = await getTrendingKeywords();

    // キャッシュ統計をログ出力
    const cacheStats = keywordsCache.getStats();

    return NextResponse.json({
      ...keywordsData,
      cache: {
        hit: cacheStats.hits > 0,
        stats: cacheStats,
      },
    });
  } catch {
    const now = new Date();
    return NextResponse.json(
      {
        error: 'Failed to fetch trending keywords',
        trending: [],
        newTags: [],
        period: {
          from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          to: now.toISOString(),
        },
      },
      { status: 500 }
    );
  }
}
