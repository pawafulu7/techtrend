/**
 * 認証関連のルート生成ヘルパー
 */

/**
 * ログインページへのパスを生成する
 * @param callbackUrl - ログイン後にリダイレクトするURL（相対パスのみ許可）
 * @returns ログインページのURL
 */
export function loginWithCallback(callbackUrl: string): string {
  const raw = typeof callbackUrl === 'string' ? callbackUrl : '/';
  // 先頭は単一の '/' に限定し、'//'（プロトコル相対）を拒否
  const startsWithSingleSlash = raw.startsWith('/') && !raw.startsWith('//');
  // /auth/* への自己参照はループになる可能性があるためブロック
  const notAuthPath = !raw.startsWith('/auth/');
  const safeCallbackUrl = startsWithSingleSlash && notAuthPath ? raw : '/';
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