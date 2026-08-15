import { NextRequest, NextResponse } from 'next/server';
import {
  withCronOrAdminAuth,
  type Handler,
} from '@/lib/middleware/with-cron-or-admin-auth';
import { extractBearerToken } from '@/lib/auth/authorization-header';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import { resolveCronSecret } from '@/lib/auth/cron-secret';
import logger from '@/lib/logger';
import { env } from '@/lib/config/env';

function checkTokenParam(
  request: NextRequest,
  handler: Handler,
  context?: any
): Promise<Response> | null {
  const tokenParam = request.nextUrl.searchParams.get('token');
  if (!tokenParam) return null;

  const cronSecret = resolveCronSecret(env.CRON_TOKEN, env.CRON_SECRET) ?? '';
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
    const cronSecret = resolveCronSecret(env.CRON_TOKEN, env.CRON_SECRET);
    if (cronSecret) {
      const bearer = extractBearerToken(request.headers.get('authorization'));
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
