/**
 * Authorization ヘッダのスキーム別パーサー。
 *
 * Basic 認証ゲート（lib/auth/basic-auth-gate.ts）と cron 認証ラッパー各所で
 * パース規則が食い違っていたため、判定を 1 箇所に集約する。
 *
 * 受理規則:
 * - スキーム名は大文字小文字を区別しない（RFC 7235 が case-insensitive と定めている）
 * - スキームと token の区切りは空白またはタブの 1 文字以上
 *   （RFC 7235 の `1*SP` より寛容。既存の受理範囲を狭めないための意図的な拡張）
 * - token は空白・タブを含まない単一トークン。末尾の空白・タブは無視する
 * - token に制御文字を含む場合は拒否する
 *
 * このモジュールは process.env も他の lib/ モジュールも参照しない純関数のみで構成する。
 * proxy.ts（Node ランタイム）からも API route からも同じ実装を使えるようにするため。
 */

/**
 * 制御文字。Authorization ヘッダのいかなる位置でも拒否する。
 *
 * basic-auth-gate.ts の parseBasicHeader も base64 デコード後の user/pass 検証に
 * 使うため export している（定数を複製すると片方だけ変更されうるため）。
 */
export const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

const BASIC_SCHEME_PATTERN = /^Basic[ \t]+([^ \t]+)[ \t]*$/i;
const BEARER_SCHEME_PATTERN = /^Bearer[ \t]+([^ \t]+)[ \t]*$/i;

/**
 * Authorization ヘッダから指定スキームの token を取り出す共通パーサー。
 * Basic / Bearer に同じ形式・同じ検証を適用するために 1 箇所に集約している。
 */
function extractAuthToken(
  header: string | null,
  schemePattern: RegExp
): string | null {
  if (!header) return null;

  const match = schemePattern.exec(header);
  if (!match) return null;

  const token = match[1];
  if (CONTROL_CHAR_PATTERN.test(token)) return null;

  return token;
}

/**
 * `Authorization: Bearer <token>` から token を取り出す。
 * スキーム不一致・形式不正・制御文字混入はいずれも null。
 */
export function extractBearerToken(header: string | null): string | null {
  return extractAuthToken(header, BEARER_SCHEME_PATTERN);
}

/**
 * `Authorization: Basic <base64>` から base64 部分を取り出す。
 *
 * base64 としての妥当性検証・デコード・`:` 分割・NFC 正規化は行わない。
 * それらは RFC 7617 固有の処理であり basic-auth-gate.ts の責務とする。
 */
export function extractBasicToken(header: string | null): string | null {
  return extractAuthToken(header, BASIC_SCHEME_PATTERN);
}

/**
 * Bearer スキームであることだけを判定する。token は取り出さない。
 *
 * extractBearerToken(header) !== null の糖衣ではない点に注意。
 * 「スキームが Bearer か」だけを知りたい呼び出し元（CSRF 判定）にとって、
 * token 側の妥当性（制御文字の有無）は判定条件に含めるべきではないため、
 * 制御文字チェックを経由しない独立した述語としている。
 */
export function hasBearerScheme(header: string | null): boolean {
  if (!header) return false;
  return BEARER_SCHEME_PATTERN.test(header);
}
