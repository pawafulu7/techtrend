/**
 * 認証まわりの定数
 *
 * better-auth を import しないモジュールに置く。lib/auth/utils.ts がこの定数のためだけに
 * auth.ts（better-auth、ESM）を読み込むと、Jest の結合テストで utils.ts を読めなくなるため。
 */

/** better-auth のメールアドレス・パスワード認証の Account.providerId */
export const CREDENTIAL_PROVIDER_ID = 'credential' as const;
