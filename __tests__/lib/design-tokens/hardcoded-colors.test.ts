/**
 * 画面とコンポーネントのコードに色の値を直書きしていないことを確かめる（Issue #698）
 *
 * 色は lib/design-tokens/ のトークン（CSS 変数・bg-tt-* などのユーティリティ・TS の定数）から取る。
 * Tailwind の色の名前（bg-slate-100 など）は scripts/dev/lint-colors.mjs が検査している。
 * ここでは文字列に書いた hex（'#3b82f6'）と rgb() / rgba() を検査する。
 */

import fs from 'node:fs';
import path from 'node:path';

const SCAN_DIRS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);

/** ブランドの規定色をそのまま使う必要があるファイル */
const ALLOWED_FILES = new Set([
  'components/icons/google.tsx', // Google のロゴ（ブランドガイドラインの色）
]);

/**
 * 文字列の中の hex（#RGB / #RRGGBB / #RRGGBBAA。'0 0 4px #000' や bg-[#fff] のように途中にあるものも含む）
 * と rgb() / rgba() / hsl() / hsla()。ページ内リンク（href="#top"）は除く
 */
const LITERAL_COLOR =
  /(?:(?<!href=)['"`]|[\[\s(,_])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?)\(/i;

/** コメント（* で始まる行、行内の /* … *\/ と {/* … *\/}、行末まで続く /* と //）を除いたコード部分 */
function codeOf(line: string): string {
  if (line.trim().startsWith('*')) return '';
  return line
    .replace(/\/\*.*?(?:\*\/|$)/g, '')
    .replace(/(^|[^:])\/\/.*$/, '$1');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('色の直書き', () => {
  it('app/ と components/ のコードに hex・rgb() の色を書いていない', () => {
    const found: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(path.join(process.cwd(), dir))) {
        const rel = path.relative(process.cwd(), file);
        if (ALLOWED_FILES.has(rel)) continue;
        fs.readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (LITERAL_COLOR.test(codeOf(line))) {
              found.push(`${rel}:${i + 1}`);
            }
          });
      }
    }
    expect(found).toEqual([]);
  });

  it('検出の正規表現が色の値を拾い、色以外は拾わない', () => {
    const hit = (line: string) => LITERAL_COLOR.test(codeOf(line));
    expect(hit("color = '#3b82f6',")).toBe(true);
    expect(hit('fill="#FFF"')).toBe(true);
    expect(hit("boxShadow: '0 0 4px #000'")).toBe(true);
    expect(hit('className="p-2 bg-[#fff]"')).toBe(true);
    expect(hit("'rgba(148, 163, 184, 0.6)'")).toBe(true);
    expect(hit("'hsl(0 0% 0%)'")).toBe(true);
    expect(hit('href="#main-content"')).toBe(false);
    expect(hit('href="#add"')).toBe(false);
    expect(hit('// Issue #698 で追加')).toBe(false);
    expect(
      hit('      {/* 生の error.message は出さない（issue #701） */}')
    ).toBe(false);
    expect(hit('      {/* 移設した（Issue #585）。')).toBe(false);
    expect(hit("{/* note */} <div style={{ color: '#fff' }} />")).toBe(true);
    expect(hit(' * 例: rgba(0, 0, 0, 0.1)')).toBe(false);
    expect(hit("const url = 'https://example.com'; // #fff")).toBe(false);
    expect(hit('fill={colors[0]}')).toBe(false);
    expect(hit('bg-[var(--tt-color-surface)]')).toBe(false);
  });
});
