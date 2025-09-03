import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { getRedisService } from '@/lib/redis/factory';

export async function GET(request: NextRequest) {
  try {
    const redisService = getRedisService();
    
    // 認証チェック
    const session = await auth();
    
    if (!session?.user?.id) {
      console.error('[API/recommendations] No authenticated user');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get('limit') || '10')));

    // キャッシュ確認
    const cacheKey = `recommendations:${userId}:${limit}`;
    const cached = await redisService.getJSON(cacheKey);
    
    if (cached) {
      return NextResponse.json(cached);
    }

    // 推薦記事を取得
    const recommendations = await recommendationService.getRecommendations(userId, limit);

    // キャッシュに保存（5分間）
    await redisService.setJSON(cacheKey, recommendations, 300);

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('[API/recommendations] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}