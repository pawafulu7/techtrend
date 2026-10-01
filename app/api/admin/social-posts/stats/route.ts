/**
 * Social Posts API - Statistics
 *
 * GET /api/admin/social-posts/stats - ステータス別件数取得
 */

import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { getSocialPostService } from '@/lib/social-post';

/**
 * GET - ステータス別件数取得
 */
async function handler() {
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

export const GET = withAdminAuth(handler);
