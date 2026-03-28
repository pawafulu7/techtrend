import { NextRequest, NextResponse } from 'next/server';
import {
  withCronOrAdminAuth,
  type Handler,
} from '@/lib/middleware/with-cron-or-admin-auth';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import logger from '@/lib/logger';

function checkTokenParam(
  request: NextRequest,
  handler: Handler,
  context?: any
): Promise<Response> | null {
  const tokenParam = request.nextUrl.searchParams.get('token');
  if (!tokenParam) return null;

  const cronSecret = process.env.CRON_TOKEN || process.env.CRON_SECRET || '';
  if (!cronSecret || !compareSecrets(tokenParam, cronSecret)) {
    // ?token= が存在して無効な場合は即401（フォールスルーしない）
    return Promise.resolve(
      NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid token parameter.' },
        { status: 401 }
      )
    );
  }

  logger.warn(
    { path: request.nextUrl.pathname, method: request.method },
    'Deprecated: ?token= query parameter authentication. Use Authorization: Bearer header instead.'
  );
  return Promise.resolve(handler(request, context));
}

/**
 * feeds/collect専用認証アダプター（POST用）
 * withCronOrAdminAuth(Bearer + admin session) + ?token= query param後方互換
 */
export function withFeedCollectAuth(handler: Handler): Handler {
  const cronOrAdminHandler = withCronOrAdminAuth(handler);

  return async (request: NextRequest, context?: any) => {
    const tokenResult = checkTokenParam(request, handler, context);
    if (tokenResult) return tokenResult;

    return cronOrAdminHandler(request, context);
  };
}

/**
 * feeds/collect専用認証（GET用 — Bearer + ?token= のみ）
 * GETはCSRF保護対象外のため、admin session認証を許可しない
 */
export function withFeedCollectTokenAuth(handler: Handler): Handler {
  return async (request: NextRequest, context?: any) => {
    const tokenResult = checkTokenParam(request, handler, context);
    if (tokenResult) return tokenResult;

    // Bearer token チェック（admin session は許可しない）
    const cronSecret = process.env.CRON_TOKEN || process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      const bearer = authHeader?.startsWith('Bearer ')
        ? authHeader.substring('Bearer '.length)
        : undefined;
      if (bearer && compareSecrets(bearer, cronSecret)) {
        return handler(request, context);
      }
    }

    return NextResponse.json(
      {
        error: 'Unauthorized',
        message:
          'GET requires Bearer token or ?token= parameter. Use POST for session authentication.',
      },
      { status: 401 }
    );
  };
}
