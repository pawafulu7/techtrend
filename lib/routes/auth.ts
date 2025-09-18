/**
 * 認証関連のルート生成ヘルパー
 */

/**
 * ログインページへのパスを生成する
 * @param callbackUrl - ログイン後にリダイレクトするURL（相対パスのみ許可）
 * @returns ログインページのURL
 */
export function loginWithCallback(callbackUrl: string): string {
  // 相対パスのみ許可（セキュリティ対策）
  const safeCallbackUrl = callbackUrl.startsWith('/') ? callbackUrl : '/';
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