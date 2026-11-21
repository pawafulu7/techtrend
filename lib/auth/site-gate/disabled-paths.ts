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

/** 入口が HTTP で使う経路（閉じない）。引数付きの経路は disabledPaths で閉じられないものも含む */
export const GATE_OPEN_LIBRARY_PATHS = [
  '/callback/:id',
  '/error',
  '/reset-password/:token',
] as const;
