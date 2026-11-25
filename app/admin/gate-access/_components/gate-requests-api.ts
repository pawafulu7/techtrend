import type { GateAccessRequestApproveResponse } from '@/lib/auth/site-gate/admin-types';
import { GateAllowlistActionError, toActionError } from './gate-allowlist-api';

export const APPROVE_FAILED_MESSAGE = '許可できませんでした。時間をおいて再試行してください';
export const REJECT_FAILED_MESSAGE = '却下できませんでした。時間をおいて再試行してください';

function isApproveResponse(body: unknown): body is GateAccessRequestApproveResponse {
  if (typeof body !== 'object' || body === null) return false;
  const { status, email } = body as Record<string, unknown>;
  return (status === 'approved' || status === 'already_allowed') && typeof email === 'string';
}

/** 申請を許可する。失敗は画面に出せる日本語で throw する */
export async function approveGateRequest(
  id: string
): Promise<GateAccessRequestApproveResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/gate-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
  } catch {
    // 通信の失敗。例外の文言（Failed to fetch など）は出さない
    throw new GateAllowlistActionError(APPROVE_FAILED_MESSAGE, false);
  }
  if (!res.ok) throw await toActionError(res, APPROVE_FAILED_MESSAGE);
  const body: unknown = await res.json().catch(() => null);
  if (!isApproveResponse(body)) {
    throw new GateAllowlistActionError(APPROVE_FAILED_MESSAGE, false);
  }
  return body;
}

/** 申請を却下する（申請を消す） */
export async function rejectGateRequest(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/gate-requests/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    throw new GateAllowlistActionError(REJECT_FAILED_MESSAGE, false);
  }
  if (!res.ok) throw await toActionError(res, REJECT_FAILED_MESSAGE);
}
