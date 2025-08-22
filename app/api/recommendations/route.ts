import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { recommendationService } from '@/lib/recommendation/recommendation-service';
import { redisService } from '@/lib/redis/redis-service';

export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
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
    const cached = await redisService.get(cacheKey);
    
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // 推薦記事を取得
    const recommendations = await recommendationService.getRecommendations(userId, limit);

    // キャッシュに保存（5分間）
    await redisService.set(cacheKey, JSON.stringify(recommendations), 300);

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error('Failed to get recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}