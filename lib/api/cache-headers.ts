/**
 * 共有キャッシュ可能な応答のキャッシュヘッダ（issue #647）
 *
 * Basic 認証ゲートが有効なときは、ゲートを通過した応答を共有キャッシュ（Vercel の
 * エッジ・下流 CDN）に載せない。proxy.ts の finalize も private, no-store に上書き
 * するが、Route Handler が自分で設定したヘッダの方が最終応答に残る
 * （2026-10-01 に本番で実測。/api/stats が CDN-Cache-Control: max-age=600 の
 * ままエッジにキャッシュされていた）。そのため route 側で決める。
 */
import { env } from '@/lib/config/env';
import { isGateEnabled } from '@/lib/auth/basic-auth-gate';

export interface PublicCacheHeaderOptions {
  /** ゲートが無効なときの Cache-Control（例: 'public, s-maxage=300'） */
  cacheControl: string;
  /** ゲートが無効なときの CDN-Cache-Control（省略時は付けない） */
  cdnCacheControl?: string;
}

/** ゲート有効時の値。proxy.ts の finalize と同じ */
export const GATED_CACHE_CONTROL = 'private, no-store';
export const GATED_CDN_CACHE_CONTROL = 'no-store';

/**
 * 公開してよい応答のキャッシュヘッダを返す。
 * ゲートが有効なら、渡された値の代わりに private, no-store を返す。
 */
export function publicCacheHeaders(
  options: PublicCacheHeaderOptions
): Record<string, string> {
  if (isGateEnabled(env.BASIC_AUTH_ENABLED)) {
    return {
      'Cache-Control': GATED_CACHE_CONTROL,
      'CDN-Cache-Control': GATED_CDN_CACHE_CONTROL,
    };
  }

  return {
    'Cache-Control': options.cacheControl,
    ...(options.cdnCacheControl && {
      'CDN-Cache-Control': options.cdnCacheControl,
    }),
  };
}

/** publicCacheHeaders の結果を既存の Headers に設定する */
export function applyPublicCacheHeaders(
  headers: Headers,
  options: PublicCacheHeaderOptions
): void {
  for (const [name, value] of Object.entries(publicCacheHeaders(options))) {
    headers.set(name, value);
  }
}
