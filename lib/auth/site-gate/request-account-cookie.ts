/**
 * 利用の申請に使う「入口で未登録と拒否された Google アカウント」を、拒否のページと申請の受け付けへ渡す Cookie
 *
 * 2 つのことに使う（2026-11-25 のユーザーの決定）。
 * - 申請を送れる人を絞る: 送れるのは、Google のログインを通って「未登録」と拒否された人だけ。
 *   署名があるので、ログインを通っていない人は申請を送れない
 * - 申請のフォームのアドレスの欄に、直前に Google で選んだアカウントを入れておく。利用者は別の Gmail
 *   アドレスに書き換えられるので、申請されたアドレスが Google の確認を経ているとは限らない
 *
 * 入口は DB なしで、拒否した時点ではログイン状態を作らないので、拒否した応答（Google からの戻りの 302 と、
 * 許可リストから外された人への proxy の 302）に、入口の鍵で署名した Cookie としてアドレスを載せる。
 *
 * 中身は本人のアドレスだけなので暗号化はしない（HttpOnly。本人のブラウザにしか無い）。
 * proxy（Node.js のランタイム）と Route Handler の両方から読む。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GATE_BASE_PATH } from './constants';
import { GATE_EMAIL_MAX_LENGTH, normalizeGateEmail } from './email';

export const GATE_REQUEST_ACCOUNT_COOKIE = 'tt-gate.request_account';
/** 拒否されてから申請を送れる秒数（備考を書く時間。過ぎたら、入り直せばもう一度付く） */
export const GATE_REQUEST_ACCOUNT_TTL_SEC = 30 * 60;

/** 入口の鍵をそのまま使わず、用途を分けた鍵を作る（Better Auth の Cookie の署名と同じ鍵で別の文を署名しない） */
const KEY_LABEL = 'tt-gate.request_account.v1';

function sign(secret: string, payload: string): Buffer {
  const key = createHmac('sha256', secret).update(KEY_LABEL).digest();
  return createHmac('sha256', key).update(payload).digest();
}

function cookieAttributes(isProduction: boolean, maxAge: number): string[] {
  return [
    // 拒否のページ（/api/gate/error）と申請の受け付け（/api/gate/request）にだけ送る
    `Path=${GATE_BASE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(isProduction ? ['Secure'] : []),
  ];
}

export interface GateRequestAccountCookieInput {
  /** Google が返したアドレス（表示用にドットを残す。Gmail の形であること） */
  email: string;
  secret: string;
  isProduction: boolean;
  /** テスト用。既定は今 */
  now?: number;
}

/** 申請できるアカウントの Set-Cookie。Gmail の形でなければ null（申請できない） */
export function buildGateRequestAccountCookie(
  input: GateRequestAccountCookieInput
): string | null {
  const email = input.email.trim().toLowerCase();
  if (normalizeGateEmail(email) === null) return null;
  const expiresAt =
    Math.floor((input.now ?? Date.now()) / 1000) + GATE_REQUEST_ACCOUNT_TTL_SEC;
  const payload = `${expiresAt}.${Buffer.from(email, 'utf8').toString('base64url')}`;
  const signature = sign(input.secret, payload).toString('base64url');
  return [
    `${GATE_REQUEST_ACCOUNT_COOKIE}=${payload}.${signature}`,
    ...cookieAttributes(input.isProduction, GATE_REQUEST_ACCOUNT_TTL_SEC),
  ].join('; ');
}

/** Cookie を消す Set-Cookie（別のアカウントで入り直したあとに、前のアカウントで申請させない） */
export function buildGateRequestAccountClearCookie(isProduction: boolean): string {
  return [
    `${GATE_REQUEST_ACCOUNT_COOKIE}=`,
    ...cookieAttributes(isProduction, 0),
  ].join('; ');
}

/**
 * Cookie の値から、申請できるアカウントのアドレス（Google が返した形。小文字）を読む。
 * 署名が合わない・期限が切れた・Gmail の形でないときは null
 */
export function readGateRequestAccount(
  value: string | undefined,
  secret: string,
  now: number = Date.now()
): string | null {
  // 期限（10 桁）+ base64url のアドレス（254 文字 → 340 文字ほど）+ 署名（43 文字）
  if (!value || value.length > 512) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [expiresAtText, encodedEmail, signatureText] = parts;
  if (!/^\d{1,12}$/.test(expiresAtText)) return null;
  // Buffer.from(…, 'base64url') は余分な文字や別の表記も受け付けるので、形を先に確かめる
  // （署名は SHA-256 の 32 バイト = 43 文字）
  if (!/^[A-Za-z0-9_-]+$/.test(encodedEmail)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signatureText)) return null;

  const expected = sign(secret, `${expiresAtText}.${encodedEmail}`);
  const actual = Buffer.from(signatureText, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  // 43 文字目は下位 2 ビットが捨てられ、4 通りの文字が同じ署名として読める。書き戻した形と比べて
  // 1 通りにする（署名が合ったあとなので、比べ方から署名が漏れることはない）
  if (actual.toString('base64url') !== signatureText) return null;
  if (Number(expiresAtText) * 1000 <= now) return null;

  const email = Buffer.from(encodedEmail, 'base64url').toString('utf8');
  if (email.length > GATE_EMAIL_MAX_LENGTH || normalizeGateEmail(email) === null) {
    return null;
  }
  return email;
}
