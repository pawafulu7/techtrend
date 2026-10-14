import { commonActionErrorMessage } from '@/lib/utils/action-error-messages';
import type { AdminApiErrorCode } from '@/lib/constants/admin-api-error-codes';
import type { AdminUser } from '../_types';

// API のコードごとの文言。サーバーの error は英語の内部向けの文言なので出さない（issue #797）
const CODE_MESSAGES = {
  // ダイアログは失敗しても一覧を取り直すので、一覧の更新は案内しない
  USER_NOT_FOUND: 'ユーザーが見つかりません。既に削除された可能性があります',
  CANNOT_CHANGE_OWN_ROLE: '自分のロールは変更できません',
  CANNOT_DEACTIVATE_SELF: '自分のアカウントは無効化できません',
  ALREADY_DEACTIVATED: 'このユーザーは既に無効化されています',
  LAST_ADMIN:
    '管理者がいなくなるため実行できません。先に別のユーザーを管理者にしてください',
  ADMIN_REQUIRED: 'この操作には管理者の権限が必要です',
  USER_DELETED: 'あなたのアカウントは無効化されているため、操作できません',
} satisfies Record<AdminApiErrorCode, string>;

// Object.prototype の名前（toString など）を表の文言に当てないよう、自身のキーだけを見る
const isAdminApiErrorCode = (code: unknown): code is AdminApiErrorCode =>
  typeof code === 'string' && Object.hasOwn(CODE_MESSAGES, code);

function adminUserActionErrorMessage(
  status: number,
  body: unknown,
  fallback: string
): string {
  const code =
    body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  if (isAdminApiErrorCode(code)) {
    return CODE_MESSAGES[code];
  }
  return commonActionErrorMessage(status) ?? fallback;
}

type AdminUserAction =
  { action: 'changeRole'; role: AdminUser['role'] } | { action: 'deactivate' };

/**
 * 管理画面からユーザーを更新する。失敗したら、画面にそのまま出せる日本語の文言で throw する
 *
 * @param failedMessage - コードやステータスから文言を選べないとき（CSRF の 403・500・通信の失敗など）の文言
 */
export async function patchAdminUser(
  userId: string,
  body: AdminUserAction,
  failedMessage: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // 通信の失敗。例外の文言（Failed to fetch など）は出さない
    throw new Error(failedMessage);
  }
  if (!res.ok) {
    // 本文が JSON でない（Basic 認証の 401 など）ときも、ステータスから文言を選ぶ
    const data: unknown = await res.json().catch(() => null);
    throw new Error(
      adminUserActionErrorMessage(res.status, data, failedMessage)
    );
  }
}
