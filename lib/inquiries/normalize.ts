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

// 双方向テキストの制御文字（U+202A〜U+202E、U+2066〜U+2069）。
// 管理画面で文の並びを偽装されないように除く
const BIDI_CONTROL_CHARACTERS = /[\u202A-\u202E\u2066-\u2069]/g;

export function normalizeInquiryMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .replace(BIDI_CONTROL_CHARACTERS, '')
    .trim();
}
