/**
 * 問い合わせの種別・対応状況と入力の上限
 *
 * 送信画面（Client）・管理画面・API が共通で使う。クライアントのバンドルに載るので、
 * zod や Prisma のランタイムは import しない（型だけ import する）。
 */
import type { InquiryCategory, InquiryStatus } from '@/lib/prisma-exports';

export type { InquiryCategory, InquiryStatus };

/**
 * enum の値をすべて並べた配列を返す。値が1つでも欠けると引数の型が合わずにコンパイルが止まる
 * （Prisma のスキーマに値を足したとき、ここを直し忘れないように）
 */
function listAllValues<T extends string>() {
  return <const L extends readonly T[]>(
    list: L & ([T] extends [L[number]] ? unknown : never)
  ): L => list;
}

export const INQUIRY_CATEGORIES = listAllValues<InquiryCategory>()([
  'FEATURE_REQUEST',
  'BUG_REPORT',
  'OTHER',
]);

export const INQUIRY_STATUSES = listAllValues<InquiryStatus>()([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
]);

export const INQUIRY_CATEGORY_LABELS = {
  FEATURE_REQUEST: '機能の要望',
  BUG_REPORT: '不具合の報告',
  OTHER: 'その他',
} as const satisfies Record<InquiryCategory, string>;

/** 送信画面の種別のタイルに添える短い説明 */
export const INQUIRY_CATEGORY_DESCRIPTIONS = {
  FEATURE_REQUEST: 'あると便利な機能・改善',
  BUG_REPORT: '表示の崩れ・動かない',
  OTHER: '質問・感想など',
} as const satisfies Record<InquiryCategory, string>;

/** 本文の欄の下に出す補足（種別ごと。未選択は DEFAULT） */
export const INQUIRY_MESSAGE_HINTS = {
  FEATURE_REQUEST: 'ほしい機能と、それで何ができるようになるかを書いてください',
  BUG_REPORT: '起きたこと・開いていた画面・期待した動きを書いてください',
  OTHER: '質問・感想などを自由に書いてください',
  // 「内容を書いてください」は未入力のエラーの文言なので、補足には使わない
  DEFAULT: '種別を選ぶと、書くとよいことを案内します',
} as const satisfies Record<InquiryCategory | 'DEFAULT', string>;

export const INQUIRY_STATUS_LABELS = {
  OPEN: '未対応',
  IN_PROGRESS: '対応中',
  RESOLVED: '完了',
} as const satisfies Record<InquiryStatus, string>;

/** 本文の上限（正規化した後の文字数。UTF-16 のコード単位で数える） */
export const INQUIRY_MESSAGE_MAX_LENGTH = 5000;

/** 返信先のメールアドレスの上限（RFC 5321 の上限。DB は VARCHAR(254)） */
export const INQUIRY_EMAIL_MAX_LENGTH = 254;

/** 送信 API が読む本文（JSON）のバイト数の上限 */
export const INQUIRY_REQUEST_MAX_BYTES = 64 * 1024;

export function isInquiryCategory(value: unknown): value is InquiryCategory {
  return (
    typeof value === 'string' &&
    (INQUIRY_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return (
    typeof value === 'string' &&
    (INQUIRY_STATUSES as readonly string[]).includes(value)
  );
}
