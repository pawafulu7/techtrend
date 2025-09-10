import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { getRedisService } from '@/lib/redis/factory';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const redisService = getRedisService();
    
    // 認証チェック
    const session = await auth();
    
    if (!session?.user?.id) {
      logger.warn({ route: 'API/recommendations' }, 'No authenticated user');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    // Next.js 15.xでのNextRequest対応
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get('limit') || '10')));

    // キャッシュ確認（エラーは無視）
    const cacheKey = `recommendations:${userId}:${limit}`;
    let cached = null;
    try {
      cached = await redisService.getJSON(cacheKey);
    } catch (cacheError) {
      logger.warn({ err: cacheError, route: 'API/recommendations', limit }, 'Cache read error');
    }
    
    if (cached) {
      return NextResponse.json(cached);
    }

    // 推薦記事を取得
    const recommendations = await recommendationService.getRecommendations(userId, limit);

    // キャッシュに保存（5分間）- エラーは無視
    try {
      await redisService.setJSON(cacheKey, recommendations, 300);
    } catch (cacheError) {
      logger.warn({ err: cacheError, route: 'API/recommendations', limit }, 'Cache write error');
    }

    return NextResponse.json(recommendations);
  } catch (error) {
    logger.error({ err: error, route: 'API/recommendations' }, 'Unhandled error');
    return NextResponse.json(
      { error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}