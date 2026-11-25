import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getGateAuth } from '@/lib/auth/site-gate/gate-auth';
import {
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
} from '@/lib/auth/site-gate/constants';
import type { SiteGateSettings } from '@/lib/auth/site-gate/config';
import { z } from 'zod';
import {
  renderGateErrorPage,
  toGateRateLimitedPage,
  type GateAccessRequestView,
} from '@/lib/auth/site-gate/error-page';
import {
  UNKNOWN_GATE_ERROR_CODE,
  toDisplayedGateErrorCode,
} from '@/lib/auth/site-gate/error-codes';
import {
  GATE_ERROR_NOTICE_COOKIE,
  buildGateErrorNoticeCookie,
  redirectsToGateErrorPage,
} from '@/lib/auth/site-gate/error-notice';
import { GATE_START_PATH } from '@/lib/auth/site-gate/constants';
import {
  GATE_REQUEST_ACCOUNT_COOKIE,
  buildGateRequestAccountClearCookie,
  buildGateRequestAccountCookie,
  readGateRequestAccount,
} from '@/lib/auth/site-gate/request-account-cookie';
import { captureRejectedGateAccount } from '@/lib/auth/site-gate/rejected-account-context';
import { hasGateAccessRequest } from '@/lib/auth/site-gate/access-request-store';
import { normalizeGateEmail } from '@/lib/auth/site-gate/email';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';
import { summarizeError } from '@/lib/utils/sanitize-error';

/**
 * 入口の Google からの戻り（Better Auth に渡す）と、拒否・失敗のページ（自前の HTML）の GET。
 * ほかの /api/gate/* は 404 にし、入口用の Better Auth の HTTP の経路は戻りのほかに出さない
 * （利用の申請の POST は、静的なセグメントの app/api/gate/request/route.ts）。
 *
 * 守りの本体はこの完全一致（disabledPaths は引数付きの経路を閉じられない）。生のパスで比べるので、
 * %67oogle のような符号化・// の重なり・/callback/github も 404。POST などは export しないので Next が 405 を返す。
 * HEAD は GET の関数で処理されるので、method を確かめて 404 にする。開始は静的なセグメントの
 * app/api/gate/start/route.ts が先に当たる。
 */
const HANDLED_PATHS: ReadonlySet<string> = new Set([
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
]);

/**
 * エラーページの ?error=（API の入力は Zod で受ける。.coderabbit.yaml の app/api の規則）。
 * 知っているコードだけを通し、無い・長すぎる・知らないコードは unknown（lib/auth/site-gate/error-codes.ts）
 */
const errorCodeSchema = z
  .string()
  .max(64)
  .transform(toDisplayedGateErrorCode)
  .catch(UNKNOWN_GATE_ERROR_CODE);

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function forward(request: Request, settings: SiteGateSettings): Promise<Response> {
  // ログイン時の確認が「未登録」と拒否したアカウントを受け取る（利用の申請に使う）
  const { result: response, email: rejectedAccount } =
    await captureRejectedGateAccount(() => getGateAuth(settings).handler(request));
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  // 拒否・失敗で拒否のページへ移すときだけ、ページを出してよい目印を付ける（URL を直接開いたときは出さない）
  if (redirectsToGateErrorPage(response.headers.get('location'), settings.baseOrigin)) {
    headers.append('Set-Cookie', buildGateErrorNoticeCookie(settings.isProduction));
  }
  // 未登録と拒否したときは、そのアカウントで利用の申請を送れるようにする。それ以外の戻り（通過・取り消し・
  // 別の失敗）では消す（前に拒否された別のアカウントの申請を、次の拒否のページで受け付けない）
  headers.append(
    'Set-Cookie',
    (rejectedAccount === null
      ? null
      : buildGateRequestAccountCookie({
          email: rejectedAccount,
          secret: settings.secret,
          isProduction: settings.isProduction,
        })) ?? buildGateRequestAccountClearCookie(settings.isProduction)
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * 拒否のページに出す、利用の申請の扱い。未登録（not_allowed）で、拒否されたアカウントが分かるときだけ。
 * すでに申請が届いていればフォームを出さない。確かめられないとき（DB の障害）はフォームを出す
 * （送信の側でもう一度確かめる）
 */
async function resolveRequestView(
  request: NextRequest,
  code: string,
  settings: SiteGateSettings
): Promise<GateAccessRequestView | undefined> {
  if (code !== 'not_allowed') return undefined;
  const account = readGateRequestAccount(
    request.cookies.get(GATE_REQUEST_ACCOUNT_COOKIE)?.value,
    settings.secret
  );
  const email = account === null ? null : normalizeGateEmail(account);
  if (account === null || email === null) return undefined;
  try {
    if (await hasGateAccessRequest(prisma, email)) {
      return { kind: 'pending', account };
    }
  } catch (error) {
    logger.warn(
      { errorSummary: summarizeError(error) },
      '[site-gate] 利用の申請の有無を確かめられませんでした'
    );
  }
  return { kind: 'form', account };
}

// Google からの戻り。DB なしの state は Cookie にあり、同じ Cookie で 10 分間は戻りを繰り返せる
// （そのたびに Google へトークンの交換を送る）ので、IP ごとに回数を絞る。Redis を使えないときは数えずに通す
const rateLimitedCallback = withRateLimit(
  'auth:gate-callback',
  (request, context: { settings: SiteGateSettings }) =>
    forward(request, context.settings),
  { resolveSession: false, allowOnLimiterError: true }
);

/**
 * 拒否・失敗のページ。Better Auth の組み込みのページ（英語・外部へのリンク付き）は使わない
 * （lib/auth/site-gate/error-page.ts）。コードは知っているものだけを出し、error_description は読まない
 */
async function errorPage(
  request: NextRequest,
  settings: SiteGateSettings
): Promise<Response> {
  const code = errorCodeSchema.parse(
    new URL(request.url).searchParams.get('error')
  );
  const { status, html } = renderGateErrorPage(
    code,
    await resolveRequestView(request, code, settings)
  );
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// 拒否のページは、利用の申請が届いているかを DB で引く。ページを出してよい目印の Cookie には署名が無く、
// 申請用の Cookie は 30 分使い回せるので、IP ごとに回数を絞る。Redis を使えないときは数えずに通す
const rateLimitedErrorPage = withRateLimit(
  'auth:gate-error',
  (request, context: { settings: SiteGateSettings }) =>
    errorPage(request, context.settings),
  { resolveSession: false, allowOnLimiterError: true }
);

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== 'GET') return notFound();
  const config = getSiteGateConfig();
  if (config.kind !== 'enabled') return notFound();

  const url = new URL(request.url);
  if (!HANDLED_PATHS.has(url.pathname)) return notFound();

  if (url.pathname === GATE_CALLBACK_PATH) {
    // 回数の制限に達したときは、JSON ではなくページで返す（Google から画面の遷移で戻ってくるため）
    return toGateRateLimitedPage(
      await rateLimitedCallback(request, { settings: config.settings })
    );
  }

  // 拒否・失敗のページ。ログインが拒否・失敗した直後（目印の Cookie があるとき）だけ出し、URL を直接
  // 開いたときは入口のログインの開始へ移す（ユーザーの決定）
  if (!request.cookies.get(GATE_ERROR_NOTICE_COOKIE)?.value) {
    const start = new URL(GATE_START_PATH, config.settings.baseOrigin);
    start.searchParams.set('callbackURL', '/');
    const redirect = NextResponse.redirect(start, 302);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  }

  return toGateRateLimitedPage(
    await rateLimitedErrorPage(request, { settings: config.settings })
  );
}
