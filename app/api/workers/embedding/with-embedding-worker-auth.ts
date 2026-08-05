import { NextRequest, NextResponse } from 'next/server';
import { type Handler } from '@/lib/middleware/with-cron-or-admin-auth';
import { compareSecrets } from '@/lib/utils/compare-secrets';
import { env } from '@/lib/config/env';

/**
 * embedding worker専用認証（GET用 — Bearerのみ）
 *
 * GET は Next.js のグローバル CSRF ミドルウェアによる保護対象外のため、
 * admin session Cookie を受理すると CSRF 経由で第三者にワーカーを
 * 起動されてしまう（状態変更を伴うエンドポイントに対する攻撃ベクトル）。
 * そのため admin session 認証は許可せず、Authorization: Bearer による
 * Cron Secret 認証のみを受理する。?token= クエリパラメータの後方互換も
 * 設けない（embedding エンドポイントに既存の利用者がいないため）。
 */
export function withEmbeddingWorkerAuth(handler: Handler): Handler {
  return async (request: NextRequest, context?: any) => {
    const cronSecret = env.CRON_TOKEN || env.CRON_SECRET;
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
        message: 'This endpoint requires a valid Bearer token.',
      },
      { status: 401 }
    );
  };
}
