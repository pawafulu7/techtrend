import { NextResponse, type NextRequest } from 'next/server';
import { getSiteGateConfig } from '@/lib/auth/site-gate/server-config';
import { getGateAuth } from '@/lib/auth/site-gate/gate-auth';
import {
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
} from '@/lib/auth/site-gate/constants';

/**
 * 入口用の Better Auth の HTTP の経路のうち、Google からの戻りと組み込みのエラーページの GET だけを渡す。
 *
 * 守りの本体はこの完全一致（disabledPaths は引数付きの経路を閉じられない）。生のパスで比べるので、
 * %67oogle のような符号化・// の重なり・/callback/github も 404。POST などは export しないので Next が 405 を返す。
 * HEAD は GET の関数で処理されるので、method を確かめて 404 にする。開始は静的なセグメントの
 * app/api/gate/start/route.ts が先に当たる。
 */
const FORWARDED_PATHS: ReadonlySet<string> = new Set([
  GATE_CALLBACK_PATH,
  GATE_ERROR_PATH,
]);

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== 'GET') return notFound();
  const config = getSiteGateConfig();
  if (config.kind !== 'enabled') return notFound();

  const url = new URL(request.url);
  if (!FORWARDED_PATHS.has(url.pathname)) return notFound();

  let forwarded: Request = request;
  if (url.pathname === GATE_ERROR_PATH) {
    // 組み込みのページは error_description をエスケープしたうえで本文に出すので、入口の外から誰でも
    // サイトのドメインで任意の文言を出せてしまう。コード（error）だけを渡す
    url.searchParams.delete('error_description');
    forwarded = new Request(url, { method: 'GET', headers: request.headers });
  }

  const response = await getGateAuth(config.settings).handler(forwarded);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
