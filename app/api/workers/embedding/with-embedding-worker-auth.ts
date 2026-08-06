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
 *
 * CRON_TOKEN / CRON_SECRET の扱い:
 * `CRON_TOKEN || CRON_SECRET` は「両方が同時に有効な独立した資格情報」では
 * なく、CRON_TOKEN を新名称・CRON_SECRET を旧名称とする**リネーム移行の
 * フォールバック**である（lib/middleware/with-cron-or-admin-auth.ts の
 * 「CRON_TOKEN/CRON_SECRET両対応（後方互換性）」と同じ契約）。
 * したがって両方が設定されている場合は CRON_TOKEN が優先され、CRON_SECRET の
 * 値では認証できない。これは意図した挙動であり、移行完了後に旧シークレットが
 * 有効なまま残らないようにするための設計。
 * 同じロジックを with-cron-or-admin-auth.ts:38 と
 * app/api/feeds/collect/with-feed-collect-auth.ts:18,61 も採用している。
 */
export function withEmbeddingWorkerAuth(handler: Handler): Handler {
  return async (request: NextRequest, context?: any) => {
    // 上記 docblock 参照: フォールバックであって「両方有効」ではない
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
