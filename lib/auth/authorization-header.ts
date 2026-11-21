/**
 * Authorization ヘッダのスキームの判定（CSRF の判定 lib/middleware/csrf-protection.ts が使う）。
 *
 * 受理規則:
 * - スキーム名は大文字小文字を区別しない（RFC 7235 が case-insensitive と定めている）
 * - スキームと token の区切りは空白またはタブの 1 文字以上
 *   （RFC 7235 の `1*SP` より寛容。既存の受理範囲を狭めないための意図的な拡張）
 * - token は空白・タブを含まない単一トークン。末尾の空白・タブは無視する
 *
 * このモジュールは process.env も他の lib/ モジュールも参照しない純関数のみで構成する。
 * proxy.ts（Node ランタイム）からも API route からも同じ実装を使えるようにするため。
 */

const BEARER_SCHEME_PATTERN = /^Bearer[ \t]+([^ \t]+)[ \t]*$/i;

/**
 * Bearer スキームであることだけを判定する。token は取り出さない。
 *
 * token は取り出さないので、token 側の妥当性は見ない。
 * 「スキームが Bearer か」だけを知りたい呼び出し元（CSRF 判定）にとって、
 * token 側の妥当性（制御文字の有無）は判定条件に含めるべきではないため、
 * 制御文字チェックを経由しない独立した述語としている。
 */
export function hasBearerScheme(header: string | null): boolean {
  if (!header) return false;
  return BEARER_SCHEME_PATTERN.test(header);
}
