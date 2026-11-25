/**
 * proxy.ts が全リクエストの最初に行う入口の判定
 *
 * 入口用の Better Auth と許可リストは、入口の Cookie があるときにだけ loadDeps で読む（未ログインのアクセスでは
 * DB にもインスタンスの読み込みにも触れない）。判定と応答の組み立てだけをここに置き、テストでは loadDeps を差し替える。
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { SiteGateConfig, SiteGateSettings } from './config';
import {
  GATE_COOKIE_PREFIX,
  GATE_ERROR_CODES,
  GATE_ERROR_PATH,
  GATE_PUBLIC_PATHS,
  GATE_REQUEST_PATH,
  GATE_START_PATH,
} from './constants';
import { normalizeGateEmail } from './email';
import { buildGateErrorNoticeCookie } from './error-notice';
import type { GateAccess } from './gate-auth-options';
import {
  buildGateRequestAccountClearCookie,
  buildGateRequestAccountCookie,
} from './request-account-cookie';

export interface GateSessionInfo {
  email: string;
  emailVerified: boolean;
  /** 入口のログイン状態の作成時刻（足し直した行より前のログインを見分ける） */
  createdAt: Date;
}

export interface SiteGateDeps {
  /** 入口のログイン状態を確かめる。返す setCookies は、通過する応答にだけ載せる */
  getSession(headers: Headers): Promise<{
    session: GateSessionInfo | null;
    setCookies: string[];
  }>;
  /** 入口の Cookie を消す Set-Cookie（本番の名前・属性、分割された session_data.N を含む） */
  signOut(headers: Headers): Promise<string[]>;
  checkAccess(email: string, sessionCreatedAt: Date): Promise<GateAccess>;
}

export type SiteGateOutcome =
  /** 入口が無効。何もしない */
  | { kind: 'disabled' }
  /** 設定が足りない。呼び出し元が 503 にする */
  | { kind: 'misconfigured'; reason: string }
  /** 入口のログインそのものの経路（開始・戻り・エラー）。入口を通さずに続ける */
  | { kind: 'public' }
  /** 通過。setCookies を通過する応答にだけ載せる */
  | { kind: 'pass'; setCookies: string[] }
  /** 拒否（開始かエラーページへの 302、または 401・403） */
  | { kind: 'deny'; response: NextResponse }
  /** 確認の途中で例外。呼び出し元が 503 にする（拒否の側に倒す） */
  | { kind: 'unavailable'; error: unknown };

const SESSION_COOKIE_NAME = `${GATE_COOKIE_PREFIX}.session_token`;

/** 入口のログイン状態の Cookie があるか（本番の __Secure- 付きの名前も見る。中身の確認は getSession で行う） */
export function hasGateSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(`__Secure-${SESSION_COOKIE_NAME}`)?.value ||
    request.cookies.get(SESSION_COOKIE_NAME)?.value
  );
}

/**
 * アプリ内のログアウト。入口のログイン状態が切れていても通す（通さないと、ログアウトしたつもりでアプリの
 * ログイン状態が残り、別の許可済みのアカウントで入口を通り直したときに前のアカウントのまま使えてしまう）。
 * ログアウトは Cookie のセッションを消すだけで、中身を返さない
 */
const APP_SIGN_OUT_PATH = '/api/auth/sign-out';

function isGatePublicRequest(request: NextRequest): boolean {
  if (request.method === 'POST' && request.nextUrl.pathname === APP_SIGN_OUT_PATH) {
    return true;
  }
  // 拒否のページのフォームからの利用の申請。入口を通れない人が送るので、入口の外から通す。
  // 誰の申請かは Route Handler が署名付きの Cookie で確かめる（app/api/gate/request/route.ts）
  if (request.method === 'POST' && request.nextUrl.pathname === GATE_REQUEST_PATH) {
    return true;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return GATE_PUBLIC_PATHS.includes(request.nextUrl.pathname);
}

/**
 * 入口の Cookie を消す Set-Cookie から、state の Cookie（tt-gate.oauth_state）の削除を除く。
 * ライブラリの削除処理は state も消すので、別のタブで進行中の入口のログインを壊すため
 */
export function withoutOAuthStateDeletion(setCookies: string[]): string[] {
  return setCookies.filter(
    (cookie) => !/^(__Secure-)?tt-gate\.oauth_state=/.test(cookie)
  );
}

/**
 * ブラウザの遷移（アドレスバー・リンク・フォームの GET）か。遷移なら Google のログインへ移し、それ以外は 401・403 にする。
 *
 * proxy は Next の内部の見出し（rsc など）だけを消し、Sec-Fetch-* は残す（next/dist/server/web/adapter.js）。
 * 画面内の遷移やプリフェッチの取得は Sec-Fetch-Mode: cors で届くので 401 になり、開始の回数を使わず、進行中の
 * ログインの state も上書きしない。取得が失敗すると Next のクライアントは通常の遷移でやり直し、それが navigate で届く。
 * Sec-Fetch-Mode を送らない古いブラウザのために、ページへの GET・HEAD と、Accept に text/html を含む /api/ への GET も
 * 遷移として扱う。
 */
export function isBrowserNavigation(request: NextRequest): boolean {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return false;
  const mode = request.headers.get('sec-fetch-mode');
  if (mode !== null) return mode === 'navigate';
  if (!request.nextUrl.pathname.startsWith('/api/')) return true;
  return (
    method === 'GET' &&
    (request.headers.get('accept') ?? '').includes('text/html')
  );
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function gateJson(
  status: 401 | 403,
  code: string,
  message: string
): NextResponse {
  return noStore(
    NextResponse.json({ success: false, error: message, code }, { status })
  );
}

/**
 * 入口のログイン状態が無い・無効・期限切れ。
 * 移動先は設定のベース URL から作る（要求の Host から作ると、Host をそのまま通す reverse proxy の後ろで
 * 別のホストへ移せてしまう。また state の Cookie は開いたホストに付くので、正規のホストで始める）
 */
function requireSignIn(request: NextRequest, baseOrigin: string): NextResponse {
  if (isBrowserNavigation(request)) {
    const start = new URL(GATE_START_PATH, baseOrigin);
    start.searchParams.set(
      'callbackURL',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return noStore(NextResponse.redirect(start, 302));
  }
  return gateJson(
    401,
    GATE_ERROR_CODES.sessionRequired,
    'Site sign-in required'
  );
}

/**
 * 入口のログイン状態はあるが、許可リストから外された。入口の Cookie を消す。
 * requestAccount は、拒否のページで利用の申請を受け付けるアカウント（確認済みの Gmail のときだけ）
 */
function rejectRevoked(
  request: NextRequest,
  settings: SiteGateSettings,
  clearCookies: string[],
  requestAccount: string | null
): NextResponse {
  let response: NextResponse;
  if (isBrowserNavigation(request)) {
    const error = new URL(GATE_ERROR_PATH, settings.baseOrigin);
    error.searchParams.set('error', 'not_allowed');
    response = noStore(NextResponse.redirect(error, 302));
    // 拒否のページは、この目印があるときだけ出す（lib/auth/site-gate/error-notice.ts）
    response.headers.append('Set-Cookie', buildGateErrorNoticeCookie(settings.isProduction));
    // 拒否のページのフォームで、このアカウントの利用の申請を受け付ける（Google からの戻りの拒否と同じ）。
    // 申請できないアカウントのときは消す（前に拒否された別のアカウントの申請を、このページで受け付けない）
    response.headers.append(
      'Set-Cookie',
      (requestAccount === null
        ? null
        : buildGateRequestAccountCookie({
            email: requestAccount,
            secret: settings.secret,
            isProduction: settings.isProduction,
          })) ?? buildGateRequestAccountClearCookie(settings.isProduction)
    );
  } else {
    response = gateJson(
      403,
      GATE_ERROR_CODES.notAllowed,
      'Site access revoked'
    );
  }
  for (const cookie of withoutOAuthStateDeletion(clearCookies)) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}

/**
 * 入口の判定。
 *
 * - 無効・設定不備はそのまま返す
 * - 開始・戻り・エラーの GET は public
 * - 入口の Cookie が無ければ、インスタンスを読まずに拒否する
 * - Cookie があれば getSession で確かめ、Gmail・メールの確認・許可リストの 3 つを照らす。
 *   拒否の応答には getSession の Set-Cookie を載せない（無効なセッションの削除には oauth_state の削除も入り、
 *   別のタブで進行中の入口のログインを壊すため）
 */
export async function evaluateSiteGate(
  request: NextRequest,
  config: SiteGateConfig,
  loadDeps: (settings: SiteGateSettings) => Promise<SiteGateDeps>
): Promise<SiteGateOutcome> {
  if (config.kind === 'disabled') return { kind: 'disabled' };
  if (config.kind === 'misconfigured') {
    return { kind: 'misconfigured', reason: config.reason };
  }
  if (isGatePublicRequest(request)) return { kind: 'public' };
  const { baseOrigin } = config.settings;
  if (!hasGateSessionCookie(request)) {
    return { kind: 'deny', response: requireSignIn(request, baseOrigin) };
  }

  try {
    const deps = await loadDeps(config.settings);
    const { session, setCookies } = await deps.getSession(request.headers);
    if (session === null) {
      return { kind: 'deny', response: requireSignIn(request, baseOrigin) };
    }

    const email = normalizeGateEmail(session.email);
    const access: GateAccess =
      email === null || session.emailVerified !== true
        ? 'not_allowed'
        : await deps.checkAccess(email, session.createdAt);

    if (access === 'allowed') return { kind: 'pass', setCookies };
    if (access === 'stale_session') {
      return { kind: 'deny', response: requireSignIn(request, baseOrigin) };
    }
    // 取り消し後は入口の Cookie を消す（API の 403 でも消す。開いたままのタブが要求のたびに DB を引き続けないように）
    let clearCookies: string[] = [];
    try {
      clearCookies = await deps.signOut(request.headers);
    } catch {
      // 消せなくても拒否は続ける（次の要求でもう一度ここに来る）
    }
    return {
      kind: 'deny',
      response: rejectRevoked(
        request,
        config.settings,
        clearCookies,
        email !== null && session.emailVerified === true ? session.email : null
      ),
    };
  } catch (error) {
    return { kind: 'unavailable', error };
  }
}
