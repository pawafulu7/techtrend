/**
 * 送信フォームの定数と、応答・セッションの読み取り（表示に関わらない部分）
 */
import {
  INQUIRY_MESSAGE_MAX_LENGTH,
  type InquiryCategory,
} from '@/lib/inquiries/constants';

export interface ContactFormValues {
  category: InquiryCategory | undefined;
  message: string;
  contactEmail: string;
}

// 画面側の簡易な形式チェック。最終的な判定は API（zod の email）が行う
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = {
  category: '種別を選んでください',
  messageEmpty: '内容を書いてください',
  messageTooLong: `${INQUIRY_MESSAGE_MAX_LENGTH} 文字以内で書いてください`,
  email: 'メールアドレスの形式を確かめてください',
  tooLarge: '内容が長すぎます。短くしてから送ってください',
  generic: '送信できませんでした。時間をおいてもう一度送ってください',
} as const;

// API が 400 で返す項目名と、その項目の下に出す文言（Object.hasOwn で引く）
export const FIELD_ERRORS: Record<
  string,
  { name: keyof ContactFormValues; message: string } | undefined
> = {
  category: { name: 'category', message: MESSAGES.category },
  message: { name: 'message', message: '内容を確かめてください' },
  contactEmail: { name: 'contactEmail', message: MESSAGES.email },
};

export function rateLimitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return '送信が続いたため受け付けを止めています。しばらくしてからもう一度送ってください';
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `送信が続いたため受け付けを止めています。約 ${minutes} 分後にもう一度送ってください`;
}

// 送信の時間切れ。これを過ぎたら「送信できませんでした」と出し、もう一度送れるようにする
export const SUBMIT_TIMEOUT_MS = 20_000;

/** ログイン中で退会していないアカウントのメール（それ以外は未ログイン扱い） */
export function activeAccountEmail(session: unknown): string | null {
  if (!isRecord(session) || !isRecord(session.user)) return null;
  const { email, deletedAt } = session.user;
  if (deletedAt) return null;
  return typeof email === 'string' ? email : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 201 の応答から、紐付けと返信先の有無を取り出す（形が違えば「どちらも無し」とみなす） */
export function readSubmitResult(json: unknown): {
  linkedToAccount: boolean;
  hasReplyChannel: boolean;
} {
  const data = isRecord(json) && isRecord(json.data) ? json.data : {};
  return {
    linkedToAccount: data.linkedToAccount === true,
    hasReplyChannel: data.hasReplyChannel === true,
  };
}

/** 400 の応答から、不正だった項目の名前を取り出す */
export function readErrorField(json: unknown): string | undefined {
  if (!isRecord(json) || !isRecord(json.error)) return undefined;
  return typeof json.error.field === 'string' ? json.error.field : undefined;
}

/** aria-describedby に渡す id を空白でつなぐ（無い id は飛ばす） */
export function joinIds(...ids: Array<string | false | undefined>): string {
  return ids.filter(Boolean).join(' ');
}
