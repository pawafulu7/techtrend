/**
 * Better Auth の HTTP エンドポイントのうち、閉じるもの（lib/auth/auth.ts の disabledPaths）
 *
 * 依存の無いモジュールにして、E2E（__tests__/e2e/auth-disabled-paths.spec.ts）からも読む。
 * E2E は、admin プラグインが実際に持つエンドポイントがすべてこの一覧に入っていることも確かめるので、
 * better-auth の版を上げてエンドポイントが増えると落ちる。
 */

/**
 * パスワードを変えても他のセッションを失効させない組み込みのエンドポイント。
 * パスワード変更は独自 API（/api/user/password）で行い、そちらが他のセッションを失効させる（#666）
 */
export const PASSWORD_CHANGE_PATHS = ['/change-password'] as const;

/**
 * admin プラグインの HTTP エンドポイント。アプリは使わない（管理画面は app/api/admin/** の独自 API）。
 * 開けておくと、独自 API の「最後の管理者」の確認・監査ログ・認証キャッシュの破棄を通らずに、
 * role の変更・ユーザーの作成と削除・なりすましができるので、すべて閉じる。
 * プラグインは role 列と既定の role のために残す。/admin/set-user-password は #666 で閉じたもの
 */
export const UNUSED_ADMIN_PLUGIN_PATHS = [
  '/admin/ban-user',
  '/admin/create-user',
  '/admin/get-user',
  '/admin/has-permission',
  '/admin/impersonate-user',
  '/admin/list-user-sessions',
  '/admin/list-users',
  '/admin/remove-user',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/set-role',
  '/admin/set-user-password',
  '/admin/stop-impersonating',
  '/admin/unban-user',
  '/admin/update-user',
] as const;
