import { commonActionErrorMessage } from '@/lib/utils/action-error-messages';
import type { GateAllowlistErrorCode } from '@/lib/constants/gate-allowlist-error-codes';
import { GATE_ALLOWLIST_MAX_ENTRIES } from '@/lib/auth/site-gate/constants';
import type {
  GateAllowlistAddResponse,
  GateAllowlistResponse,
} from '@/lib/auth/site-gate/admin-types';

/** QueryProvider はアカウントの切り替えで ['admin'] で始まるキーを捨てる（app/providers/query-provider.tsx） */
export const gateAllowlistQueryKey = ['admin', 'gate-allowlist'] as const;

/** 画面にそのまま出せる日本語の文言を持つ失敗。入力の誤り（400・409）だけ入力欄を赤くする */
export class GateAllowlistActionError extends Error {
  constructor(
    message: string,
    readonly isInputError: boolean
  ) {
    super(message);
    this.name = 'GateAllowlistActionError';
  }
}

/** 一覧の取得の失敗。401・403 を見分けるために status を持つ */
export class GateAllowlistFetchError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch the gate allowlist (${status})`);
    this.name = 'GateAllowlistFetchError';
  }
}

// API のコードごとの文言。サーバーの error は英語の内部向けの文言なので出さない
const CODE_MESSAGES = {
  NOT_GMAIL: '@gmail.com のアドレスを入力してください',
  ALREADY_FIXED: 'このアドレスは設定で固定されています',
  ALREADY_LISTED: 'このアドレスはすでに一覧にあります',
  LIST_FULL: `これ以上追加できません（${GATE_ALLOWLIST_MAX_ENTRIES} 件まで）`,
  ENTRY_NOT_FOUND: 'このアドレスはすでに一覧から削除されています',
  CANNOT_REMOVE_CURRENT_ACCOUNT: '今使っているアカウントは削除できません',
} satisfies Record<GateAllowlistErrorCode, string>;

// Object.prototype の名前（toString など）を表の文言に当てないよう、自身のキーだけを見る
const isGateAllowlistErrorCode = (code: unknown): code is GateAllowlistErrorCode =>
  typeof code === 'string' && Object.hasOwn(CODE_MESSAGES, code);

export const ADD_FAILED_MESSAGE = '追加できませんでした。時間をおいて再試行してください';
export const REMOVE_FAILED_MESSAGE = '削除できませんでした。時間をおいて再試行してください';

async function toActionError(
  res: Response,
  fallback: string
): Promise<GateAllowlistActionError> {
  // 本文が JSON でない（プロキシのエラーページなど）ときも、ステータスから文言を選ぶ
  const body: unknown = await res.json().catch(() => null);
  const code =
    body && typeof body === 'object' && 'code' in body ? body.code : undefined;
  const isInputError = res.status === 400 || res.status === 409;
  if (isGateAllowlistErrorCode(code)) {
    return new GateAllowlistActionError(CODE_MESSAGES[code], isInputError);
  }
  return new GateAllowlistActionError(
    commonActionErrorMessage(res.status, body) ?? fallback,
    false
  );
}

export async function fetchGateAllowlist(
  signal?: AbortSignal
): Promise<GateAllowlistResponse> {
  const res = await fetch('/api/admin/gate-allowlist', { signal });
  if (!res.ok) throw new GateAllowlistFetchError(res.status);
  return res.json();
}

/** 追加したアドレス（正規化した形）を返す。失敗は画面に出せる日本語で throw する */
export async function addGateEmail(email: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/admin/gate-allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    // 通信の失敗。例外の文言（Failed to fetch など）は出さない
    throw new GateAllowlistActionError(ADD_FAILED_MESSAGE, false);
  }
  if (!res.ok) throw await toActionError(res, ADD_FAILED_MESSAGE);
  const body = (await res.json().catch(() => null)) as GateAllowlistAddResponse | null;
  return body?.entry.email ?? email;
}

export async function removeGateEmail(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/gate-allowlist/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    throw new GateAllowlistActionError(REMOVE_FAILED_MESSAGE, false);
  }
  if (!res.ok) throw await toActionError(res, REMOVE_FAILED_MESSAGE);
}
