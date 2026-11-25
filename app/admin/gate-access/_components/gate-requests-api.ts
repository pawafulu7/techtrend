import type { GateAccessRequestApproveResponse } from '@/lib/auth/site-gate/admin-types';
import { GateAllowlistActionError, toActionError } from './gate-allowlist-api';

export const APPROVE_FAILED_MESSAGE = '許可できませんでした。時間をおいて再試行してください';
export const REJECT_FAILED_MESSAGE = '却下できませんでした。時間をおいて再試行してください';

/** 通知メールを送れなかったときに、区画に残す知らせ（許可は済んでいる。行は一覧から消えるので、アドレスを入れる） */
export function approvalEmailFailedMessage(email: string): string {
  return `${email} を許可しましたが、通知メールを送れませんでした。本人に直接知らせてください`;
}
/** 同じことを、許可の直後の知らせ（見出しは「… を許可しました」）に添える文 */
export const APPROVAL_EMAIL_FAILED_DESCRIPTION =
  '通知メールは送れませんでした。本人に直接知らせてください';
export const APPROVAL_EMAIL_SENT_DESCRIPTION = '通知メールを送りました';

function parseApproveResponse(body: unknown): GateAccessRequestApproveResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const { status, email, notification } = body as Record<string, unknown>;
  if ((status !== 'approved' && status !== 'already_allowed') || typeof email !== 'string') {
    return null;
  }
  return {
    status,
    email,
    // 許可は済んでいるので、通知の欄が読めなくても失敗にはしない（「送っていない」として扱う）
    notification: notification === 'sent' || notification === 'failed' ? notification : 'none',
  };
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
  const body = parseApproveResponse(await res.json().catch(() => null));
  if (body === null) {
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
