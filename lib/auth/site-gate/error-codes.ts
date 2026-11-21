/**
 * 入口の拒否・失敗のページ（/api/gate/error、lib/auth/site-gate/error-page.ts）に出してよいコード
 *
 * ページは入口の外から誰でも開けるので、?error= の値をそのまま出すと、任意の文言
 * （例: Your_access_was_revoked_call_xxx）をサイトのドメインで出せてしまう。知っているコードだけを通す。
 * ライブラリを上げてコードが増えたら、ここに無いものは unknown と出る（ページは出るので、入り直しはできる）。
 */
const KNOWN_GATE_ERROR_CODES: ReadonlySet<string> = new Set([
  // 入口のログイン時の確認（gate-auth-options.ts の GATE_LOGIN_ERROR_CODES と、確認が例外を投げたとき）
  'not_allowed',
  'email_not_verified',
  'temporarily_unavailable',
  'validation_failed',
  // 戻りの処理（better-auth/dist/oauth2/errors.mjs の OAUTH_CALLBACK_ERROR_CODES）
  'no_code',
  'oauth_provider_not_found',
  'issuer_missing',
  'issuer_mismatch',
  'invalid_code',
  'nonce_binding_missing',
  'unable_to_get_user_info',
  'no_callback_url',
  'unable_to_link_account',
  'email_does_not_match',
  'account_already_linked_to_different_user',
  'email_not_found',
  // state（better-auth/dist/state.mjs・oauth2/state.mjs）
  'state_generation_error',
  'state_invalid',
  'state_mismatch',
  'state_not_found',
  'state_security_mismatch',
  'please_restart_the_process',
  'invalid_callback_request',
  // Google が戻りに付ける OAuth のエラー（利用者がアカウントの選択を取り消したときの access_denied など）
  'access_denied',
  'invalid_request',
  'invalid_scope',
  'server_error',
  'interaction_required',
  'login_required',
  'consent_required',
  'account_selection_required',
  // そのほかの失敗
  'internal_server_error',
  'unable_to_create_user',
  'unable_to_create_session',
  'user_not_found',
]);

export const UNKNOWN_GATE_ERROR_CODE = 'unknown';

/** エラーページに出すコード。知らないコードは unknown にする */
export function toDisplayedGateErrorCode(raw: string): string {
  return KNOWN_GATE_ERROR_CODES.has(raw) ? raw : UNKNOWN_GATE_ERROR_CODE;
}
