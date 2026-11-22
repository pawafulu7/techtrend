/**
 * 入口の拒否・失敗のページ（/api/gate/error）を、ログインが拒否・失敗した直後だけ出すための目印の Cookie
 *
 * ページの URL を直接開いたときは出さない（2026-11-21 のユーザーの決定）。拒否・失敗のページへ移す応答
 * （Google からの戻りの Better Auth の 302 と、許可リストから外された人への proxy の 302）にだけ付け、
 * ページは目印があるときだけ表示し、無ければ入口のログインの開始へ移す。
 * 依存の無いモジュールにする（proxy・Route Handler の両方から読む）。
 */
import { GATE_ERROR_PATH } from './constants';

export const GATE_ERROR_NOTICE_COOKIE = 'tt-gate.error_notice';
/** 拒否・失敗のあと、ページを出してよい秒数（再読み込みにも出す） */
export const GATE_ERROR_NOTICE_TTL_SEC = 60;

/** 目印の Set-Cookie。ページの経路にだけ送る */
export function buildGateErrorNoticeCookie(isProduction: boolean): string {
  return [
    `${GATE_ERROR_NOTICE_COOKIE}=1`,
    `Path=${GATE_ERROR_PATH}`,
    `Max-Age=${GATE_ERROR_NOTICE_TTL_SEC}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(isProduction ? ['Secure'] : []),
  ].join('; ');
}

/** 302 の移動先が拒否・失敗のページか */
export function redirectsToGateErrorPage(location: string | null, baseOrigin: string): boolean {
  if (!location) return false;
  try {
    return new URL(location, baseOrigin).pathname === GATE_ERROR_PATH;
  } catch {
    return false;
  }
}
