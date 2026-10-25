/**
 * 認証関連のルート生成ヘルパー
 */
import { toInternalPath } from './internal-path';

/**
 * callbackUrlを検証し、内部相対パスのみ許可する。
 * 外部URL（//プロトコル相対、`/\evil.example` など）や/auth/*自己参照をブロック。
 */
export function sanitizeCallbackUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  const path = toInternalPath(raw);
  if (!path || path.startsWith('/auth/')) return '/';
  return path;
}

/**
 * ログインページへのパスを生成する
 * @param callbackUrl - ログイン後にリダイレクトするURL（相対パスのみ許可）
 * @returns ログインページのURL
 */
export function loginWithCallback(callbackUrl: string): string {
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl);
  const params = new URLSearchParams({ callbackUrl: safeCallbackUrl });
  return `/auth/login?${params.toString()}`;
}

/**
 * 認証関連のパス定数
 */
export const AUTH_PATHS = {
  login: '/auth/login',
  signup: '/auth/signup',
  signout: '/auth/signout',
  verify: '/auth/verify',
  error: '/auth/error',
} as const;

/**
 * 確認メールのリンクを開いた後の戻り先。
 * Better Auth は確認に失敗したときもここへ戻し、`&error=<コード>` を付ける
 * （app/auth/verify/page.tsx が読む）。
 */
export const EMAIL_VERIFICATION_CALLBACK_URL = `${AUTH_PATHS.verify}?success=true`;
