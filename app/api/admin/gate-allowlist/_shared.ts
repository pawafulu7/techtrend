import { NextResponse } from 'next/server';
import type { GateAllowlistErrorCode } from '@/lib/constants/gate-allowlist-error-codes';

export const NO_STORE = 'private, no-cache, no-store, must-revalidate';

/** 画面がコードで文言を選ぶ形（ユーザー管理の API と同じ { error, code }） */
export function gateAllowlistError(
  status: 400 | 404 | 409,
  code: GateAllowlistErrorCode,
  message: string
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, code },
    { status, headers: { 'Cache-Control': NO_STORE } }
  );
}

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': NO_STORE },
  });
}
