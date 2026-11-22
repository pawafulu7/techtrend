import { toInternalPath } from '@/lib/routes/internal-path';
import { GATE_BASE_PATH, GATE_CALLBACK_MAX_LENGTH } from './constants';

/**
 * 入口のログインのあとに戻る先を、同じサイトのパスに解決する。解決できない・入口自身（循環）・長すぎるときは `/`。
 *
 * sanitizeCallbackUrl（/auth/ を / に変える）は使わない。確認メールのリンク（/auth/verify?...）などは、
 * 入口のログインを挟んでもそのまま戻す。
 */
export function resolveGateCallbackPath(raw: string | null): string {
  if (raw === null || raw === '') return '/';
  const path = toInternalPath(raw);
  if (path === null) return '/';
  // 入口自身かはパスだけで見る（/api/gate?x=1 や /api/gate#x も入口自身）。戻り先はクエリとフラグメントを保つ
  const { pathname } = new URL(path, 'http://internal.invalid');
  if (pathname === GATE_BASE_PATH || pathname.startsWith(`${GATE_BASE_PATH}/`)) return '/';
  if (path.length > GATE_CALLBACK_MAX_LENGTH) return '/';
  return path;
}
