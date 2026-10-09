/**
 * 書体と文字サイズのスケール（lib/design-tokens/scales.ts）が使われていることを確かめる（Issue #699）
 *
 * - TT の書体トークンが、layout.tsx の next/font が作る変数（--font-inter など）を参照する
 * - スケール表の大きさが h1 > h2 > h3 > 本文 > 要約 > 補足 の順になっている
 * - cn()（tailwind-merge）が text-h1 などを文字色のクラスと取り違えて消さない
 * - h1〜h3 と CardTitle に text-sm などのサイズを直書きしない（text-h1 / text-h2 / text-h3 を使う）
 */

import fs from 'node:fs';
import path from 'node:path';
import { textStyles, typography } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('書体トークン', () => {
  const layout = read('app/layout.tsx');
  const nextFontVars = [
    ...layout.matchAll(/variable:\s*'(--font-[\w-]+)'/g),
  ].map((m) => m[1]);

  it('layout.tsx の next/font が3つの変数を作っている', () => {
    expect(nextFontVars).toEqual([
      '--font-space-grotesk',
      '--font-inter',
      '--font-jetbrains-mono',
    ]);
  });

  it.each([
    ['heading', '--font-space-grotesk'],
    ['body', '--font-inter'],
    ['mono', '--font-jetbrains-mono'],
  ] as const)('%s は next/font の %s を先頭で参照する', (key, variable) => {
    expect(typography.family[key].startsWith(`var(${variable}),`)).toBe(true);
  });

  it('見出し・本文の書体は和文の書体を名前で指定する', () => {
    expect(typography.family.heading).toContain("'Hiragino Sans'");
    expect(typography.family.body).toContain("'Yu Gothic UI'");
  });
});

/** サイズの値を px にする（clamp は最小値と最大値の両方を返す） */
function sizeRangePx(size: string): [number, number] {
  const rems = [...size.matchAll(/([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
  if (size.startsWith('clamp(')) {
    return [rems[0], rems[rems.length - 1]];
  }
  return [rems[0], rems[0]];
}

describe('文字サイズのスケール', () => {
  it('h1 > h2 > h3 > 本文 > 要約 > 補足 の順に小さくなる（clamp の最小値でも逆転しない）', () => {
    const order = ['h1', 'h2', 'h3', 'body', 'summary', 'caption'] as const;
    for (let i = 0; i < order.length - 1; i++) {
      const [largerMin] = sizeRangePx(textStyles[order[i]].size);
      const [, smallerMax] = sizeRangePx(textStyles[order[i + 1]].size);
      expect(largerMin).toBeGreaterThan(smallerMax);
    }
  });

  it('本文は 15〜16px、要約は 14px', () => {
    const [body] = sizeRangePx(textStyles.body.size);
    const [summary] = sizeRangePx(textStyles.summary.size);
    expect(body).toBeGreaterThanOrEqual(15);
    expect(body).toBeLessThanOrEqual(16);
    expect(summary).toBe(14);
  });
});

describe('cn() と役割のクラス', () => {
  it('文字色のクラスと併せても役割のクラスを残す', () => {
    expect(cn('text-h1 text-foreground')).toBe('text-h1 text-foreground');
    expect(cn('text-summary', 'text-muted-foreground')).toBe(
      'text-summary text-muted-foreground'
    );
  });

  it('サイズのクラス同士は後から書いた方が残る', () => {
    expect(cn('text-h3', 'text-sm')).toBe('text-sm');
    expect(cn('text-sm', 'text-h3')).toBe('text-h3');
  });
});

const SCAN_DIRS = ['app', 'components'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__']);

/** スケールの外のサイズ（text-sm、sm:text-xl、text-[13px]、text-[var(--tt-text-sm)] など） */
const LITERAL_SIZE =
  /(?<![\w-])(?:[a-z0-9-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:[\d.]+(?:px|rem|em)|var\(--tt-text-[\w-]+\))\])(?![\w-])/;

const HEADING_TAG = /<(h[1-3]|CardTitle)\b/g;

/**
 * 対象外（見出しではなく、ラベルや装飾として大きさを決めているもの）
 * - 404 ページの「404」は数字の表示で、ページ見出しは h2 の「ページが見つかりません」
 * - KPI カードの CardTitle（総読書数など）は数値のラベル
 */
const ALLOWED: Array<{ file: string; tag: string; reason: string }> = [
  { file: 'app/not-found.tsx', tag: 'h1', reason: '404 の数字' },
  {
    file: 'app/analytics/analytics-content.tsx',
    tag: 'CardTitle',
    reason: 'KPI のラベル',
  },
  { file: 'app/admin/page.tsx', tag: 'CardTitle', reason: 'KPI のラベル' },
  {
    file: 'components/dashboard/MetricsCard.tsx',
    tag: 'CardTitle',
    reason: 'KPI のラベル',
  },
];

/**
 * `<h1 ...>` の開始タグの全文を返す。属性の {} の中にある `=>` や文字列の `>` では止まらない
 */
function openingTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** source の中で、サイズを直書きした見出しの「タグ名:行」を返す */
function literalSizeHeadings(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(HEADING_TAG)) {
    const tag = openingTag(source, m.index ?? 0);
    if (LITERAL_SIZE.test(tag)) {
      const line = source.slice(0, m.index).split('\n').length;
      found.push(`${m[1]}:${line}`);
    }
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('見出しのサイズ指定', () => {
  it('h1〜h3 と CardTitle はスケールのクラス（text-h1 など）を使い、サイズを直書きしない', () => {
    const violations: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(path.join(process.cwd(), dir))) {
        const rel = path.relative(process.cwd(), file);
        for (const hit of literalSizeHeadings(fs.readFileSync(file, 'utf8'))) {
          const tag = hit.split(':')[0];
          if (ALLOWED.some((a) => a.file === rel && a.tag === tag)) continue;
          violations.push(`${rel} ${hit}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('検出が複数行の cn() や属性内の => を越えて、サイズの直書きを拾う', () => {
    expect(
      literalSizeHeadings('<h1 className="text-2xl font-bold">x</h1>')
    ).toEqual(['h1:1']);
    expect(
      literalSizeHeadings(
        [
          '<h3',
          '  onClick={() => go()}',
          "  className={cn('font-semibold', isRead && 'sm:text-lg')}",
          '>',
        ].join('\n')
      )
    ).toEqual(['h3:1']);
    expect(
      literalSizeHeadings('<h3 className="line-clamp-2 text-[13px]">x</h3>')
    ).toEqual(['h3:1']);
    expect(
      literalSizeHeadings(
        '<h3 className="text-[var(--tt-text-sm)] font-semibold">x</h3>'
      )
    ).toEqual(['h3:1']);
    expect(
      literalSizeHeadings('<CardTitle className="flex text-lg">x</CardTitle>')
    ).toEqual(['CardTitle:1']);
  });

  it('スケールのクラス・色・開始タグの外にあるサイズは拾わない', () => {
    expect(
      literalSizeHeadings('<h2 className="text-foreground text-h2">x</h2>')
    ).toEqual([]);
    expect(
      literalSizeHeadings(
        '<h3 className="text-h3 text-[var(--tt-color-text)]">x</h3>'
      )
    ).toEqual([]);
    expect(
      literalSizeHeadings(
        '<h2 className="text-h2">x <span className="text-sm">y</span></h2>'
      )
    ).toEqual([]);
    expect(
      literalSizeHeadings('<header className="text-sm">x</header>')
    ).toEqual([]);
  });
});
