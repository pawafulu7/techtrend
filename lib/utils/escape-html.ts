/**
 * HTML のテキストと属性値（引用符で囲んだもの）に埋める値のエスケープ
 *
 * 依存を持たないモジュールにする（入口の単独の HTML ページ lib/auth/site-gate/page-shell.ts と、
 * メールの HTML の枠 lib/email/layout.ts が使う）。
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
