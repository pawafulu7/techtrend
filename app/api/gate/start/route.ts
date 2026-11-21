import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getGateAuth } from '@/lib/auth/site-gate/gate-auth';
import { resolveGateCallbackPath } from '@/lib/auth/site-gate/callback-path';
import { GATE_START_PATH } from '@/lib/auth/site-gate/constants';
import type { SiteGateSettings } from '@/lib/auth/site-gate/config';
import logger from '@/lib/logger';
import { summarizeError } from '@/lib/utils/sanitize-error';

/**
 * サイトの入口のログインの開始（GET）。proxy.ts が、入口のログイン状態の無いブラウザの遷移をここへ移す。
 *
 * Better Auth の /sign-in/social は HTTP では閉じ（lib/auth/site-gate/disabled-paths.ts）、ここから
 * auth.api.signInSocial を呼ぶ。サーバー側からの呼び出しは戻り先の検査もレート制限も通らないので、
 * どちらもここで行う。
 */

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function startSignIn(
  request: NextRequest,
  settings: SiteGateSettings
): Promise<Response> {
  const callbackURL = resolveGateCallbackPath(
    request.nextUrl.searchParams.get('callbackURL')
  );

  let result: { url: string | undefined; setCookies: string[] };
  try {
    // 要求の見出し（Cookie など）は渡さない。開始は state の Cookie を作るだけで、要求の中身を使わない
    // （__tests__/e2e/site-gate-auth.spec.ts もこの形で確かめている）
    const { headers, response } = await getGateAuth(settings).api.signInSocial({
      body: { provider: 'google', callbackURL },
      headers: new Headers(),
      returnHeaders: true,
    });
    result = { url: response?.url, setCookies: headers.getSetCookie() };
  } catch (error) {
    logger.error(
      { errorSummary: summarizeError(error) },
      '[site-gate] ログインを開始できませんでした'
    );
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!result.url) {
    logger.error(
      '[site-gate] ログインの開始で Google の URL が返りませんでした'
    );
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const response = NextResponse.redirect(result.url, 302);
  // state の Cookie（tt-gate.oauth_state）。戻りで Google とのコードの交換の前に照らす
  for (const cookie of result.setCookies) {
    response.headers.append('Set-Cookie', cookie);
  }
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

// 開始は Cookie を 1 つ作るだけで外部へ通信しないので、Redis を使えないときは数えずに通す
// （守りの本体は Google のログインと許可リストの照合）。匿名のアクセスなので、セッションは引かない
const rateLimitedStart = withRateLimit(
  'auth:gate-start',
  (request, context: { settings: SiteGateSettings }) =>
    startSignIn(request, context.settings),
  { resolveSession: false, allowOnLimiterError: true }
);

export async function GET(request: NextRequest): Promise<Response> {
  const config = getSiteGateConfig();
  if (config.kind !== 'enabled') return notFound();

  // state の Cookie はアクセスしたホストに付き、Google の戻り先は baseURL から作る。違うホスト
  // （*.vercel.app の別名や www の有無）で始めると毎回 state_mismatch になるので、正規のホストで始め直す
  const base = new URL(config.settings.baseOrigin);
  if (request.nextUrl.host !== base.host) {
    const canonical = new URL(GATE_START_PATH, base);
    canonical.search = request.nextUrl.search;
    const redirect = NextResponse.redirect(canonical, 302);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  }

  return rateLimitedStart(request, { settings: config.settings });
}
