/**
 * 問い合わせの本文の正規化
 *
 * 送信画面（文字数の表示と検証）と API（保存前の検証）が同じ値を数えるように、
 * どちらもこの関数を通す。依存を持たないので、クライアントのバンドルに載せてよい。
 *
 * HTML タグは除かない（不具合の報告に貼られたコード片を残すため）。管理画面では
 * React のテキストとして描画するのでエスケープされる。
 */

// 改行（\n）とタブ（\t）以外の C0 制御文字、DEL、C1 制御文字。
// NUL は PostgreSQL の text に入らず、ほかの制御文字も本文には要らない
const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// 見えない書式の文字。管理画面で文の並びや見た目を偽装されないように、また見えない文字だけの
// 本文を「空でない」と数えないように除く。
// 双方向の埋め込み・上書き・分離（U+202A〜U+202E、U+2066〜U+2069）、方向の印（LRM・RLM の
// U+200E・U+200F、ALM の U+061C）、ゼロ幅の文字（U+200B〜U+200D、U+2060、U+FEFF）
const INVISIBLE_FORMAT_CHARACTERS =
  /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

export function normalizeInquiryMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .replace(INVISIBLE_FORMAT_CHARACTERS, '')
    .trim();
}
