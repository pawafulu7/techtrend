import { NextRequest } from 'next/server';
import { withCronOrAdminAuth } from '@/lib/middleware/with-cron-or-admin-auth';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import logger from '@/lib/logger';

type Handler = (
  request: NextRequest,
  context?: any
) => Promise<Response> | Response;

/**
 * feeds/collect専用認証アダプター
 * withCronOrAdminAuthに加えて、?token= query paramでの認証をサポート
 * (後方互換性のため。新規利用は非推奨)
 */
export function withFeedCollectAuth(handler: Handler): Handler {
  const cronOrAdminHandler = withCronOrAdminAuth(handler);

  return async (request: NextRequest, context?: any) => {
    // まず?token=をチェック（GETリクエストの後方互換）
    const tokenParam = request.nextUrl.searchParams.get('token');
    if (tokenParam) {
      const cronSecret =
        process.env.CRON_TOKEN || process.env.CRON_SECRET || '';
      if (cronSecret && compareSecrets(tokenParam, cronSecret)) {
        // ?token= 使用時に非推奨警告をログ出力
        logger.warn(
          { path: request.nextUrl.pathname, method: request.method },
          'Deprecated: ?token= query parameter authentication. Use Authorization: Bearer header instead.'
        );
        return handler(request, context);
      }
    }

    // ?token=がない or 無効 → withCronOrAdminAuth（Bearer + admin session）に委譲
    return cronOrAdminHandler(request, context);
  };
}
