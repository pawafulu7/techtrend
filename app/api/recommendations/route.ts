import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { getRedisService } from '@/lib/redis/factory';

const redisService = getRedisService();

export async function GET(request: NextRequest) {
  try {
    console.log('[API/recommendations] Request received');
    
    // 認証チェック
    const session = await auth();
    console.log('[API/recommendations] Session:', {
      hasSession: !!session,
      userId: session?.user?.id,
      userName: session?.user?.name
    });
    
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
      console.log('[API/recommendations] Returning cached data');
      return NextResponse.json(cached);
    }

    // 推薦記事を取得
    console.log('[API/recommendations] Fetching recommendations for user:', userId, 'limit:', limit);
    const recommendations = await recommendationService.getRecommendations(userId, limit);
    console.log('[API/recommendations] Got recommendations:', recommendations.length, 'items');

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