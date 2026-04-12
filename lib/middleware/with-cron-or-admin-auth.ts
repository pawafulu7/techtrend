import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import { getUserAuthData } from '@/lib/auth/user-auth-cache';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

export type Handler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

/**
 * Cron Secret認証またはAdmin Session認証を要求するミドルウェア
 *
 * 認証方式:
 * 1. Cron Secret: Authorization: Bearer ${CRON_SECRET}
 * 2. Admin Session: Auth.js session with role=admin
 *
 * セキュリティ機能:
 * - タイミング攻撃対策（定数時間比較）
 * - 不正アクセス試行のログ記録
 * - CRON_TOKEN/CRON_SECRET両対応（後方互換性）
 *
 * @example
 * // 単独使用
 * export const POST = withCronOrAdminAuth(generateSummariesHandler);
 *
 * @example
 * // withRateLimitと組み合わせ（認証後にレート制限）
 * export const POST = withCronOrAdminAuth(
 *   withRateLimit('ai:summary', generateSummariesHandler)
 * );
 */
export function withCronOrAdminAuth(handler: Handler): Handler {
  return async (request: NextRequest, context?: any) => {
    // 1. Cron Secret認証（Bearer）
    const cronSecret = env.CRON_TOKEN || env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring('Bearer '.length)
        : undefined;

      if (token && compareSecrets(token, cronSecret)) {
        // Cron実行時はレート制限なしで直接実行
        return handler(request, context);
      }
    }

    // 2. Admin Session認証（DB-backed role + deletedAt verification）
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) {
      const authData = await getUserAuthData(session.user.id);
      if (authData && !authData.deletedAt && authData.role === 'admin') {
        return handler(request, { ...context, session });
      }
    }

    // 3. 認証失敗: ログ記録 + 401
    const clientIP =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';

    logger.warn(
      {
        path: request.nextUrl.pathname,
        method: request.method,
        ip: clientIP,
        userAgent: request.headers.get('user-agent'),
        hasAuthHeader: !!request.headers.get('authorization'),
        hasSession: !!session,
        sessionRole: session?.user?.role,
      },
      'Unauthorized AI generation API access attempt'
    );

    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'This endpoint requires Cron Secret or Admin authentication.',
      },
      { status: 401 }
    );
  };
}
