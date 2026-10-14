// 画面からの更新操作（プロフィール・管理画面のユーザー操作）で、サーバーの文言をそのまま出さないための文言。
// 認証・CSRF・レート制限のミドルウェアは英語の内部向けの文言を返すため、ステータスから選ぶ（issue #729, #797）

export const SESSION_EXPIRED_MESSAGE =
  'ログインの有効期限が切れました。もう一度ログインしてからやり直してください';

export const RATE_LIMITED_MESSAGE =
  '操作の回数が多すぎます。しばらく待ってから再試行してください';

/** 操作ごとの文言を持たないステータス（401・429）の文言。それ以外は undefined */
export function commonActionErrorMessage(status: number): string | undefined {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 429) return RATE_LIMITED_MESSAGE;
  return undefined;
}
