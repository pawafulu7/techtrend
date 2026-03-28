/**
 * 認証関連のルート生成ヘルパー
 */

/**
 * callbackUrlを検証し、内部相対パスのみ許可する。
 * 外部URL（//プロトコル相対）や/auth/*自己参照をブロック。
 */
export function sanitizeCallbackUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '/';
  const startsWithSingleSlash = raw.startsWith('/') && !raw.startsWith('//');
  const notAuthPath = !raw.startsWith('/auth/');
  return startsWithSingleSlash && notAuthPath ? raw : '/';
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
