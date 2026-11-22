// 画面からの更新操作（プロフィール・管理画面のユーザー操作）で、サーバーの文言をそのまま出さないための文言。
// 認証・CSRF・レート制限のミドルウェアは英語の内部向けの文言を返すため、ステータスから選ぶ（issue #729, #797）
import { GATE_ERROR_CODES } from '@/lib/auth/site-gate/constants';

export const SESSION_EXPIRED_MESSAGE =
  'ログインの有効期限が切れました。もう一度ログインしてからやり直してください';

export const RATE_LIMITED_MESSAGE =
  '操作の回数が多すぎます。しばらく待ってから再試行してください';

/**
 * サイトの入口（Google ログイン）の 401・403。アプリ内のログインは切れていないので「ログインし直す」とは書かず、
 * ページを開き直して入口を通り直すよう案内する（proxy.ts が開き直したページを Google のログインへ移す）
 */
export const SITE_GATE_REOPEN_MESSAGE =
  'サイトに入り直す必要があります。ページを開き直してください';

const SITE_GATE_CODES: ReadonlySet<unknown> = new Set(
  Object.values(GATE_ERROR_CODES)
);

function codeOf(body: unknown): unknown {
  return body && typeof body === 'object' && 'code' in body
    ? body.code
    : undefined;
}

/** 本文が入口（Google ログイン）の拒否か（proxy の 401 GATE_SESSION_REQUIRED・403 GATE_NOT_ALLOWED） */
export function isSiteGateErrorBody(body: unknown): boolean {
  return SITE_GATE_CODES.has(codeOf(body));
}

/** 応答が入口の拒否か。本文は読み捨てる（JSON でなければ false） */
export async function isSiteGateErrorResponse(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) return false;
  try {
    return isSiteGateErrorBody(await response.json());
  } catch {
    // 本文が JSON でない・読めない
    return false;
  }
}

/**
 * 操作ごとの文言を持たないステータス（401・429）の文言。それ以外は undefined。
 * 本文（JSON を読めたとき）を渡すと、入口の 401・403 をアプリ内のログイン切れと見分ける
 */
export function commonActionErrorMessage(
  status: number,
  body?: unknown
): string | undefined {
  if ((status === 401 || status === 403) && SITE_GATE_CODES.has(codeOf(body))) {
    return SITE_GATE_REOPEN_MESSAGE;
  }
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 429) return RATE_LIMITED_MESSAGE;
  return undefined;
}
