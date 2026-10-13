import { getTrendingKeywords } from '@/lib/services/trending-keywords';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const keywordsData = await getTrendingKeywords();

    // キャッシュの統計（hits・misses）は返さない。内部の監視値は管理者だけの /api/cache/stats で見る（issue #783）
    return NextResponse.json(keywordsData);
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
