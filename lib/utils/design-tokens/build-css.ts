/**
 * Design Tokens → CSS
 *
 * lib/design-tokens/ から、次の2つを作る。
 * - app/generated-tokens.css の全文（`npm run generate:tokens` が書き出す）
 * - layout.tsx の <head> に直接埋め込む Critical CSS
 *
 * どちらも同じトークンから作るので、shadcn/ui の変数・TT トークン・Critical CSS の値は一致する
 * （__tests__/lib/design-tokens/design-tokens-css.test.ts で比べている）。
 */

import {
  designTokens,
  shadcnColorVars,
  shadowScale,
  type ColorModeTokens,
  type RadiusTokens,
} from '../../design-tokens';

type ShadcnVarName = keyof ReturnType<typeof shadcnColorVars>;

/**
 * Convert camelCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * Convert a flat object to CSS custom properties
 */
function toVars(
  obj: Record<string, string | number>,
  prefix: string,
  numericSort = false
): string {
  const entries = Object.entries(obj);

  const sorted = numericSort
    ? entries.sort(([a], [b]) => {
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);
        return isNaN(numA) || isNaN(numB) ? a.localeCompare(b) : numA - numB;
      })
    : entries.sort(([a], [b]) => a.localeCompare(b));

  return sorted
    .map(([k, v]) => {
      const kebabKey = toKebabCase(k);
      return `  --tt-${prefix}-${kebabKey}: ${v};`;
    })
    .join('\n');
}

/**
 * Convert a two-level nested color object (e.g. categoryColors.light) to CSS
 * custom properties. Emits `--tt-{prefix}-{outer}-{inner-kebab}: value;` lines.
 * Used for structured tokens that group related variants under a parent key
 * (category.bg, category.bgHover, category.icon, category.iconHover, ...).
 */
function toNestedColorVars(
  obj: Record<string, Record<string, string>>,
  prefix: string
): string {
  return nestedColorNames(obj, prefix)
    .map(([name, value]) => `  --tt-${name}: ${value};`)
    .join('\n');
}

/**
 * Flatten a two-level nested color object into `[name, value]` pairs where
 * name is `{prefix}-{outer}-{inner-kebab}` (without the `--tt-` prefix).
 */
function nestedColorNames(
  obj: Record<string, Record<string, string>>,
  prefix: string
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [outerKey, inner] of Object.entries(obj).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    // Normalise the outer key too so that future camelCase additions (e.g.
    // `inReview`) still yield kebab-cased CSS variables, matching the
    // repository-wide `--tt-*` naming convention.
    const kebabOuter = toKebabCase(outerKey);
    for (const [innerKey, value] of Object.entries(inner).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      pairs.push([`${prefix}-${kebabOuter}-${toKebabCase(innerKey)}`, value]);
    }
  }
  return pairs;
}

/**
 * チャートの系列色（配列）を `--tt-color-chart-1` から順に並べる
 */
function chartColorNames(list: readonly string[]): Array<[string, string]> {
  return list.map((value, i) => [`color-chart-${i + 1}`, value]);
}

function toChartVars(list: readonly string[]): string {
  return chartColorNames(list)
    .map(([name, value]) => `  --tt-${name}: ${value};`)
    .join('\n');
}

/**
 * 色の変数を参照する影（cardFocus・glowPrimary など）
 *
 * カスタムプロパティの var() は宣言した要素で解決されてから継承されるため、:root だけに置くと
 * 画面の一部に付けた .dark の中でもライトの色のままになる。.dark でも同じ値を宣言し直す。
 */
function colorReferencingShadows(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(designTokens.shadows).filter(([, v]) => v.includes('var('))
  );
}

/**
 * Convert nested typography object to CSS custom properties
 */
function toTypographyVars(): string {
  const lines: string[] = [];

  // Font families
  lines.push(toVars(designTokens.typography.family, 'font'));

  // Font sizes
  lines.push(toVars(designTokens.typography.size, 'text'));

  // Font weights
  lines.push(toVars(designTokens.typography.weight, 'font-weight'));

  // Line heights
  lines.push(toVars(designTokens.typography.lineHeight, 'leading'));

  // Letter spacing
  lines.push(toVars(designTokens.typography.letterSpacing, 'tracking'));

  return lines.join('\n');
}

/**
 * shadcn/ui の変数（`--background: #FFFFFF;` など）
 */
function toShadcnVars(c: ColorModeTokens): string {
  return Object.entries(shadcnColorVars(c))
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}

/**
 * TT の色トークン名（`--tt-` を除いた `color-primary` など）を全て列挙する
 */
function ttColorNames(): string[] {
  const flat = Object.keys(designTokens.colors.light)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `color-${toKebabCase(k)}`);
  const category = nestedColorNames(
    designTokens.categoryColors.light,
    'color-category'
  ).map(([name]) => name);
  const status = nestedColorNames(
    designTokens.statusColors.light,
    'color-status'
  ).map(([name]) => name);
  const chart = chartColorNames(designTokens.chartColors.light).map(
    ([name]) => name
  );
  return [...flat, ...category, ...status, ...chart];
}

/** Tailwind の rounded-* に対応付ける角丸の段（none / full は Tailwind の既定のまま） */
const THEME_RADIUS_KEYS = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
] as const satisfies readonly (keyof RadiusTokens)[];

/**
 * Tailwind の @theme
 *
 * - inline: shadcn の変数（bg-primary など）と TT トークン（bg-tt-primary など）を
 *   ユーティリティに対応付ける。値は CSS 変数のまま参照するので、.dark で切り替わる
 * - 影はユーティリティ側で色を差し込めるよう、値をそのまま @theme に書く
 */
function buildThemeCss(): string[] {
  const shadcnColors = Object.keys(shadcnColorVars(designTokens.colors.light))
    .map((name) => `  --color-${name}: var(--${name});`)
    .join('\n');
  const ttColors = ttColorNames()
    .map(
      (name) =>
        `  --color-tt-${name.replace(/^color-/, '')}: var(--tt-${name});`
    )
    .join('\n');
  const radius = THEME_RADIUS_KEYS.map(
    (k) => `  --radius-${k}: var(--tt-radius-${k});`
  ).join('\n');
  const shadow = Object.entries(shadowScale)
    .map(([k, v]) => `  --shadow-${k}: ${v};`)
    .join('\n');

  return [
    '@theme inline {',
    '  /* shadcn/ui semantic colors (bg-primary, text-muted-foreground, ...) */',
    shadcnColors,
    '',
    '  /* TT colors (bg-tt-primary, text-tt-text-muted, ...) */',
    ttColors,
    '',
    '  /* Border Radius (rounded-xs ... rounded-4xl) */',
    radius,
    '}',
    '',
    '@theme {',
    '  /* Shadows (shadow-xs ... shadow-2xl) */',
    shadow,
    '}',
  ];
}

/**
 * app/generated-tokens.css の全文
 */
export function buildTokensCss(): string {
  const lines = [
    '/**',
    ' * Auto-generated from lib/design-tokens/',
    ' * DO NOT EDIT BY HAND - Run `npm run generate:tokens` instead',
    ' */',
    '',
    ...buildThemeCss(),
    '',
    ':root {',
    '  /* shadcn/ui variables - Light Mode (derived from TT colors) */',
    toShadcnVars(designTokens.colors.light),
    '',
    '  /* Colors - Light Mode */',
    toVars(designTokens.colors.light, 'color'),
    '',
    '  /* Category Colors - Light Mode (AI search category tiles) */',
    toNestedColorVars(designTokens.categoryColors.light, 'color-category'),
    '',
    '  /* Status Colors - Light Mode (social-posts, diff-summary, metrics status UI) */',
    toNestedColorVars(designTokens.statusColors.light, 'color-status'),
    '',
    '  /* Chart Colors - Light Mode (series in charts) */',
    toChartVars(designTokens.chartColors.light),
    '',
    '  /* Typography */',
    toTypographyVars(),
    '',
    '  /* Shadows */',
    toVars(designTokens.shadows, 'shadow'),
    '',
    '  /* Spacing */',
    toVars(designTokens.spacing, 'space', true),
    '',
    '  /* Border Radius */',
    toVars(designTokens.radius, 'radius'),
    '}',
    '',
    '.dark {',
    '  /* shadcn/ui variables - Dark Mode (derived from TT colors) */',
    toShadcnVars(designTokens.colors.dark),
    '',
    '  /* Colors - Dark Mode */',
    toVars(designTokens.colors.dark, 'color'),
    '',
    '  /* Category Colors - Dark Mode */',
    toNestedColorVars(designTokens.categoryColors.dark, 'color-category'),
    '',
    '  /* Status Colors - Dark Mode */',
    toNestedColorVars(designTokens.statusColors.dark, 'color-status'),
    '',
    '  /* Chart Colors - Dark Mode */',
    toChartVars(designTokens.chartColors.dark),
    '',
    '  /* Shadows that reference colors (re-declared so a nested .dark resolves the dark color) */',
    toVars(colorReferencingShadows(), 'shadow'),
    '}',
    '',
  ];

  return lines.join('\n');
}

/** Critical CSS に入れる shadcn の変数（CSS の読み込み前の背景・文字色・ナビ・枠線） */
export const CRITICAL_COLOR_VARS = [
  'background',
  'foreground',
  'primary',
  'border',
] as const satisfies readonly ShadcnVarName[];

function criticalVars(c: ColorModeTokens): string {
  const vars = shadcnColorVars(c);
  return CRITICAL_COLOR_VARS.map((name) => `--${name}: ${vars[name]};`).join(
    ' '
  );
}

/**
 * layout.tsx の <head> に埋め込む Critical CSS
 */
export function buildCriticalCss(): string {
  return [
    `:root { ${criticalVars(designTokens.colors.light)} }`,
    `.dark { ${criticalVars(designTokens.colors.dark)} }`,
    'html.no-transitions *, html.no-transitions *::before, html.no-transitions *::after { transition: none !important; animation: none !important; }',
    'body { margin: 0; background-color: var(--background); color: var(--foreground); }',
  ].join('\n');
}
