/**
 * 角丸と影がスケール（lib/design-tokens/scales.ts）の段だけで指定されていることを確かめる（Issue #698）
 *
 * - `rounded-[32px]` `rounded-[.5rem]` のような値の角丸は使わない（rounded-xs〜rounded-4xl を使う）
 * - `shadow-[0_4px_8px_rgba(...)]` のような色を直書きした影は使わない（shadow-xs〜shadow-2xl、
 *   または --tt-shadow-* を参照する）
 * - CSS ファイルとインライン style の border-radius / box-shadow は var(--tt-*) だけにする
 * CSS 変数を参照する指定（`shadow-[0_0_0_1px_var(--sidebar-border)]` など）は対象外。
 */

import fs from 'node:fs';
import path from 'node:path';

const SCAN_DIRS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);
/** 生成物（値の正本から作る CSS）は対象外 */
const SKIP_FILES = new Set(['generated-tokens.css']);

/** 値の角丸（rounded-[32px]、rounded-t-[.5rem] など。var() を含む指定は除く） */
const LITERAL_RADIUS = /\brounded(?:-[a-z]{1,2})?-\[(?![^\]]*var\()/;
/** 色を直書きした影（rgba() / rgb() / hsl() / #hex を含む shadow-[...]） */
const LITERAL_SHADOW = /\bshadow-\[[^\]]*(?:rgba?\(|hsla?\(|#[0-9a-f]{3,8})/i;
/** CSS の border-radius / box-shadow で var() 以外の値 */
// (?!\s) で空白を読み切らせる（空白を残すと否定先読みが var( の手前の空白で成立してしまう）
const CSS_LITERAL =
  /\b(?:border-radius|box-shadow)\s*:\s*(?!\s)(?!var\(|none\b|inherit\b|initial\b|unset\b|0\s*[;!])/;
/** インライン style の borderRadius / boxShadow に書いた値（文字列・0 以外の数値。トークンの参照や型定義は除く） */
const STYLE_LITERAL =
  /\b(?:borderRadius|boxShadow)\s*:\s*(?:['"`](?!var\(|none['"`]|0['"`])|[1-9])/;

function sourceFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full, ext));
    else if (ext.test(entry.name)) out.push(full);
  }
  return out;
}

function violations(pattern: RegExp, ext: RegExp = /\.tsx?$/): string[] {
  const found: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(path.join(process.cwd(), dir), ext)) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (pattern.test(line)) {
            found.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
          }
        });
    }
  }
  return found;
}

describe('角丸・影のスケール外の指定', () => {
  it('値の角丸を使っていない', () => {
    expect(violations(LITERAL_RADIUS)).toEqual([]);
  });

  it('色を直書きした影を使っていない', () => {
    expect(violations(LITERAL_SHADOW)).toEqual([]);
  });

  it('インライン style で角丸・影の値を直書きしていない', () => {
    expect(violations(STYLE_LITERAL)).toEqual([]);
  });

  it('CSS ファイルで角丸・影の値を直書きしていない', () => {
    expect(violations(CSS_LITERAL, /\.css$/)).toEqual([]);
  });

  it('検出の正規表現が対象を拾い、変数の参照は拾わない', () => {
    expect(LITERAL_RADIUS.test('rounded-[32px]')).toBe(true);
    expect(LITERAL_RADIUS.test('rounded-[.5rem]')).toBe(true);
    expect(LITERAL_RADIUS.test('rounded-tl-[1.5rem]')).toBe(true);
    expect(LITERAL_RADIUS.test('rounded-[var(--tt-radius-xl)]')).toBe(false);
    expect(LITERAL_RADIUS.test('rounded-4xl')).toBe(false);
    expect(
      LITERAL_SHADOW.test('shadow-[0_40px_90px_-60px_rgba(15,23,42,0.85)]')
    ).toBe(true);
    expect(LITERAL_SHADOW.test('shadow-[0_0_0_1px_hsl(var(--x))]')).toBe(true);
    expect(
      LITERAL_SHADOW.test('shadow-[0_0_0_1px_var(--sidebar-border)]')
    ).toBe(false);
    expect(LITERAL_SHADOW.test('shadow-(--tt-shadow-glow-primary)')).toBe(
      false
    );
    expect(CSS_LITERAL.test('  border-radius: 9999px;')).toBe(true);
    expect(CSS_LITERAL.test('  box-shadow: 0 1px 2px #000;')).toBe(true);
    expect(CSS_LITERAL.test('  border-radius: var(--tt-radius-full);')).toBe(
      false
    );
    expect(LITERAL_RADIUS.test('rounded-[calc(var(--tt-radius-xl)-4px)]')).toBe(
      false
    );
    expect(CSS_LITERAL.test('  box-shadow: none;')).toBe(false);
    expect(CSS_LITERAL.test('  border-radius: inherit;')).toBe(false);
    expect(CSS_LITERAL.test('  border-radius: 0;')).toBe(false);
    expect(STYLE_LITERAL.test('style={{ borderRadius: 8 }}')).toBe(true);
    expect(STYLE_LITERAL.test('style={{ borderRadius: radius.lg }}')).toBe(
      false
    );
    expect(STYLE_LITERAL.test('  boxShadow: string;')).toBe(false);
    expect(STYLE_LITERAL.test('style={{ borderRadius: 0 }}')).toBe(false);
    expect(STYLE_LITERAL.test("style={{ boxShadow: '0 0 4px red' }}")).toBe(
      true
    );
    expect(
      STYLE_LITERAL.test("style={{ borderRadius: 'var(--tt-radius-lg)' }}")
    ).toBe(false);
  });
});
