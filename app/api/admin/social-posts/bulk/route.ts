/**
 * Social Posts API - Bulk Operations
 *
 * POST /api/admin/social-posts/bulk - 一括操作
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import logger from '@/lib/logger';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { getSocialPostService, SocialPostBulkSchema } from '@/lib/social-post';

/**
 * POST - 一括操作
 *
 * サポートするアクション:
 * - changeStatus: ステータス一括変更
 * - delete: 一括削除
 *
 * レート制限: 10回/分 (admin:social-post-bulk)
 */
async function bulkHandler(request: NextRequest) {
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
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Zodでバリデーション
    const parseResult = SocialPostBulkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { action, ids, status } = parseResult.data;

    // changeStatusの場合、statusが必須
    if (action === 'changeStatus' && !status) {
      return NextResponse.json(
        { error: 'Status is required for changeStatus action' },
        { status: 400 }
      );
    }

    const service = getSocialPostService();
    const result = await service.bulkAction(
      { action, ids, status },
      session.user.id,
      {
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }
    );

    logger.info(
      {
        userId: session.user.id,
        action,
        targetCount: ids.length,
        success: result.success,
        failed: result.failed,
      },
      '[SocialPostsAPI] Bulk action completed'
    );

    return NextResponse.json({
      success: true,
      action,
      processed: result.success,
      failed: result.failed,
      total: ids.length,
    });
  } catch (error) {
    logger.error({ error }, '[SocialPostsAPI] Failed to execute bulk action');
    return NextResponse.json(
      { error: 'Failed to execute bulk action' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit('admin:social-post-bulk', bulkHandler);
