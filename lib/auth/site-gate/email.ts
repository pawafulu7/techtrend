/**
 * 入口の許可リストで使う Gmail アドレスの正規化
 *
 * 依存を持たないモジュールにする（管理画面の入力の確かめと、Playwright の spec からも読むため）。
 *
 * - 前後の空白を除き、小文字にする
 * - ローカル部が英小文字・数字・ドットだけで、@gmail.com で終わるものだけを有効にする。
 *   `+` は Google が返すメールには現れず、登録しても一致しないので受け付けない。googlemail.com は
 *   「Gmail だけ」という決定の範囲を広げないため受け付けない
 * - ローカル部のドットを除く。Gmail はローカル部のドットを区別しない（同じ受信トレイに届き、ドット違いの
 *   ユーザー名は取得済みとして作れない。Google の公式ヘルプ support.google.com/mail/answer/7436150）。
 *   保存と照合の両方を同じ形にそろえるので、管理者がドットの有無を間違えても本人は拒まれず、許可も広がらない
 *
 * DB の CHECK 制約（chk_gate_allowed_email_normalized: `^[a-z0-9]+@gmail\.com$`）はこの関数の出力の形と同じ。
 */

/** RFC 5321 のアドレスの上限 */
export const GATE_EMAIL_MAX_LENGTH = 254;

const GMAIL_SUFFIX = '@gmail.com';
const GMAIL_ADDRESS_PATTERN = /^[a-z0-9.]+@gmail\.com$/;

/** 正規化した Gmail アドレスを返す。Gmail の形でなければ null */
export function normalizeGateEmail(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > GATE_EMAIL_MAX_LENGTH) {
    return null;
  }
  const lowered = raw.trim().toLowerCase();
  if (!GMAIL_ADDRESS_PATTERN.test(lowered)) return null;

  const localPart = lowered
    .slice(0, -GMAIL_SUFFIX.length)
    .replace(/\./g, '');
  if (localPart.length === 0) return null;
  return `${localPart}${GMAIL_SUFFIX}`;
}

/**
 * ログに出すためにローカル部を伏せる（先頭の 1 文字だけ残す）。アドレスそのものはログに出さない
 */
export function maskGateEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
