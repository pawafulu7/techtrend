import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getGateAuth } from '@/lib/auth/site-gate/gate-auth';
import {
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
} from '@/lib/auth/site-gate/constants';
import type { SiteGateSettings } from '@/lib/auth/site-gate/config';
import { renderGateErrorPage } from '@/lib/auth/site-gate/error-page';

/**
 * 入口の Google からの戻り（Better Auth に渡す）と、拒否・失敗のページ（自前の HTML）の GET。
 * ほかの /api/gate/* は 404 にし、入口用の Better Auth の HTTP の経路は戻りのほかに出さない。
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

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function forward(request: Request, settings: SiteGateSettings): Promise<Response> {
  const response = await getGateAuth(settings).handler(request);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Google からの戻り。DB なしの state は Cookie にあり、同じ Cookie で 10 分間は戻りを繰り返せる
// （そのたびに Google へトークンの交換を送る）ので、IP ごとに回数を絞る。Redis を使えないときは数えずに通す
const rateLimitedCallback = withRateLimit(
  'auth:gate-callback',
  (request, context: { settings: SiteGateSettings }) =>
    forward(request, context.settings),
  { resolveSession: false, allowOnLimiterError: true }
);

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== 'GET') return notFound();
  const config = getSiteGateConfig();
  if (config.kind !== 'enabled') return notFound();

  const url = new URL(request.url);
  if (!HANDLED_PATHS.has(url.pathname)) return notFound();

  if (url.pathname === GATE_CALLBACK_PATH) {
    return rateLimitedCallback(request, { settings: config.settings });
  }

  // 拒否・失敗のページ。Better Auth の組み込みのページ（英語・外部へのリンク付き）は使わない
  // （lib/auth/site-gate/error-page.ts）。コードは知っているものだけを出し、error_description は読まない
  const { status, html } = renderGateErrorPage(url.searchParams.get('error'));
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
