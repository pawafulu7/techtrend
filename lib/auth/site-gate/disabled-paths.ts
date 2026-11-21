/**
 * 入口用の Better Auth の HTTP の経路のうち、閉じるもの（gate-auth-options.ts の disabledPaths）
 *
 * 守りの本体は app/api/gate/[...all]/route.ts の完全一致（戻りとエラーの GET だけを渡し、ほかは 404）。
 * disabledPaths は HTTP の要求のパスとの完全一致だけで、/reset-password/:token のような引数付きの経路は
 * 閉じられないので、これは補助。開始は auth.api.signInSocial から呼ぶ（disabledPaths は auth.api に効かない）ので、
 * /sign-in/social も閉じる。
 *
 * 依存の無いモジュールにして、Playwright の spec（__tests__/e2e/site-gate-auth.spec.ts）からも読む。
 * spec はライブラリが実際に持つ経路とこの一覧を照らすので、better-auth の版を上げて経路が増えると落ちる。
 */
export const GATE_DISABLED_PATHS = [
  '/account-info',
  '/change-email',
  '/change-password',
  '/delete-user',
  '/delete-user/callback',
  // 拒否・失敗のページは自前で返す（lib/auth/site-gate/error-page.ts）ので、組み込みのページも閉じる
  '/error',
  '/get-access-token',
  '/get-session',
  '/link-social',
  '/list-accounts',
  '/list-sessions',
  '/ok',
  '/refresh-token',
  '/request-password-reset',
  '/reset-password',
  '/revoke-other-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/send-verification-email',
  '/sign-in/email',
  '/sign-in/social',
  '/sign-out',
  '/sign-up/email',
  '/unlink-account',
  '/update-session',
  '/update-user',
  '/verify-email',
  '/verify-password',
] as const;

/**
 * disabledPaths で閉じない経路。入口が使う戻り（/callback/:id）と、引数付きで disabledPaths では閉じられない
 * /reset-password/:token（Route Handler の完全一致で 404 にする）
 */
export const GATE_OPEN_LIBRARY_PATHS = [
  '/callback/:id',
  '/reset-password/:token',
] as const;
