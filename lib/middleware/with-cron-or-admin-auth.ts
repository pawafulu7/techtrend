import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { timingSafeEqual } from 'crypto';
import logger from '@/lib/logger';

type Handler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

/**
 * Cron Secret認証またはAdmin Session認証を要求するミドルウェア
 *
 * 認証方式:
 * 1. Cron Secret: Authorization: Bearer ${CRON_SECRET}
 * 2. Admin Session: Auth.js session with role=ADMIN
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
    const cronSecret = process.env.CRON_TOKEN || process.env.CRON_SECRET;
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

    // 2. Admin Session認証
    const session = await auth();
    if (session?.user?.role === 'admin') {
      // Admin実行時もレート制限なしで直接実行
      return handler(request, { ...context, session });
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

/**
 * タイミング攻撃対策: 定数時間での文字列比較
 *
 * 通常の文字列比較（===）は、不一致が見つかった時点で即座に返すため、
 * 比較時間からシークレットの一部が推測される可能性がある。
 * timingSafeEqualは常に同じ時間で比較を完了するため、この攻撃を防ぐ。
 */
function compareSecrets(a: string, b: string): boolean {
  try {
    // 長さが異なる場合も定数時間で処理するため、
    // まず長さを比較してから実際の値を比較
    if (a.length !== b.length) {
      // 長さ情報の漏洩を最小化するため、ダミー比較を実行
      timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(a, 'utf8'));
      return false;
    }
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}
