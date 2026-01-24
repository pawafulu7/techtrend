/**
 * Social Posts API - Statistics
 *
 * GET /api/admin/social-posts/stats - ステータス別件数取得
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { getSocialPostService } from '@/lib/social-post';

/**
 * GET - ステータス別件数取得
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized. Authentication required.' },
      { status: 401 }
    );
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden. Admin access required.' },
      { status: 403 }
    );
  }

  try {
    const service = getSocialPostService();
    const counts = await service.getStatusCounts();

    return NextResponse.json(counts, {
      headers: {
        // 短めのキャッシュで負荷軽減
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    logger.error({ error }, '[SocialPostsAPI] Failed to get status counts');
    return NextResponse.json(
      { error: 'Failed to fetch status counts' },
      { status: 500 }
    );
  }
}
