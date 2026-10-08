/**
 * 色の生成元が lib/design-tokens.ts の1つだけであることを確かめる（Issue #698）
 *
 * - app/generated-tokens.css が design-tokens.ts から再生成した内容と一致する（生成し忘れの検出）
 * - layout.tsx の Critical CSS と generated-tokens.css の shadcn 変数が、ライト・ダークとも同じ値
 * - globals.css と layout.tsx が色の値を直書きしていない
 */

import fs from 'node:fs';
import path from 'node:path';
import { colors, shadcnColorVars } from '@/lib/design-tokens';
import {
  buildCriticalCss,
  buildTokensCss,
  CRITICAL_COLOR_VARS,
} from '@/lib/utils/design-tokens/build-css';

const read = (rel: string) =>
  fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** selector の最上位ブロック（入れ子なし）にある `--name: value;` を取り出す */
function declarations(css: string, selector: ':root' | '.dark') {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace('.', '\\.');
  const block = noComments.match(
    new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`)
  );
  if (!block) throw new Error(`${selector} block not found`);
  const vars = new Map<string, string>();
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}

/** expected の各変数について、actual の値が異なる（または無い）ものを返す */
function diffVars(
  expected: Map<string, string>,
  actual: Map<string, string>,
  names: readonly string[]
): string[] {
  return names
    .map((n) => `--${n}`)
    .filter(
      (n) => expected.get(n) === undefined || expected.get(n) !== actual.get(n)
    )
    .map((n) => `${n}: ${expected.get(n)} != ${actual.get(n)}`);
}

describe('generated-tokens.css', () => {
  const generated = read('app/generated-tokens.css');

  it('design-tokens.ts から再生成した内容と一致する（npm run generate:tokens 済み）', () => {
    expect(generated).toBe(buildTokensCss());
  });

  it.each([
    [':root', colors.light],
    ['.dark', colors.dark],
  ] as const)('%s に shadcn の変数を TT トークンの値で持つ', (selector, c) => {
    const vars = declarations(generated, selector);
    for (const [name, value] of Object.entries(shadcnColorVars(c))) {
      expect(vars.get(`--${name}`)).toBe(value);
    }
    expect(vars.get('--primary')).toBe(vars.get('--tt-color-primary'));
    expect(vars.get('--background')).toBe(vars.get('--tt-color-background'));
  });
});

describe('Critical CSS（layout.tsx）', () => {
  const generated = read('app/generated-tokens.css');
  const critical = buildCriticalCss();

  it.each([':root', '.dark'] as const)(
    '%s の値が generated-tokens.css と一致する',
    (selector) => {
      const diffs = diffVars(
        declarations(generated, selector),
        declarations(critical, selector),
        CRITICAL_COLOR_VARS
      );
      expect(diffs).toEqual([]);
    }
  );

  it('値の食い違いを検出できる', () => {
    const tampered = critical.replace(
      `--primary: ${colors.light.primary};`,
      '--primary: #000000;'
    );
    expect(tampered).not.toBe(critical);
    expect(
      diffVars(
        declarations(generated, ':root'),
        declarations(tampered, ':root'),
        CRITICAL_COLOR_VARS
      )
    ).toEqual([`--primary: ${colors.light.primary} != #000000`]);
  });

  it('layout.tsx は buildCriticalCss() を使い、変数を直書きしない', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('buildCriticalCss()');
    expect(layout).not.toMatch(/--(background|foreground|primary|border)\s*:/);
  });
});

describe('globals.css', () => {
  it('色・角丸・影の変数を定義しない（値は generated-tokens.css だけが持つ）', () => {
    const globals = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const shadcnNames = Object.keys(shadcnColorVars(colors.light));
    const defined = [...globals.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    const offending = defined.filter(
      (name) =>
        name.startsWith('--tt-') ||
        name.startsWith('--color-') ||
        name.startsWith('--radius') ||
        name.startsWith('--shadow') ||
        shadcnNames.includes(name.slice(2))
    );
    expect(offending).toEqual([]);
  });
});
