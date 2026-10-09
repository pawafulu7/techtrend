export type ShadowTokens = {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  cardRest: string;
  cardHover: string;
  cardFocus: string;
  glowPrimary: string;
  inner: string;
};

export type TypographyTokens = {
  family: {
    heading: string;
    body: string;
    mono: string;
  };
  size: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    '5xl': string;
  };
  weight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
    loose: number;
  };
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
    wider: string;
  };
};

export type SpacingTokens = {
  '0': string;
  '1': string;
  '2': string;
  '3': string;
  '4': string;
  '5': string;
  '6': string;
  '8': string;
  '10': string;
  '12': string;
  '16': string;
  '20': string;
  '24': string;
  '32': string;
};

export type RadiusTokens = {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
  '4xl': string;
  full: string;
};

/**
 * 和文の書体（OS に入っているものを使い、Web フォントは読み込まない）
 *
 * 欧文の書体（Inter など）は和文の字形を持たないので、和文はこの並びの最初に見つかった書体になる。
 * Mac・iOS → Windows → Android・Linux の順に並べる。
 * Noto Sans JP を Web フォントで読み込むと、初回表示の転送量がページあたり 363〜816KB 増える
 * （2026-10 の見積もり。Issue #699）ため入れていない。
 */
const JAPANESE_FONT_STACK =
  "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, 'Noto Sans JP', 'Noto Sans CJK JP'";

/**
 * Typography Tokens
 *
 * 書体は app/layout.tsx の next/font が読み込み、`--font-inter` などの変数に入れる。
 * ここではその変数を参照するので、next/font が作る代替書体（"Inter Fallback" など）も効く。
 */
export const typography: TypographyTokens = {
  family: {
    heading: `var(--font-space-grotesk), ${JAPANESE_FONT_STACK}, system-ui, sans-serif`,
    body: `var(--font-inter), ${JAPANESE_FONT_STACK}, system-ui, sans-serif`,
    mono: "var(--font-jetbrains-mono), 'Courier New', monospace",
  },
  size: {
    xs: '0.75rem', // 12px
    sm: '0.875rem', // 14px
    base: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.25rem', // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem', // 48px
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25, // Headings
    normal: 1.5, // Default body
    relaxed: 1.625, // Reading content
    loose: 2, // Spacious content
  },
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.01em',
    wider: '0.02em',
  },
};

export type TextStyleToken = {
  size: string;
  lineHeight: number;
  weight: number;
};

/**
 * 文字の役割ごとのサイズ・行間・太さ（Issue #699 のスケール表）
 *
 * Tailwind の @theme に `--text-h1` などとして出力し、`text-h1` `text-summary` のクラスで使う。
 * h1〜h3 の既定の書式（globals.css）もこの値を使う。
 *
 * - 行間・太さは `leading-*` `font-*` を併せて書けばそちらが優先される。ただし cn() は役割のクラスより
 *   前にある `leading-*` を消す（tailwind-merge が文字サイズと行間を衝突として扱うため）。後ろに書く
 * - 役割のクラスは太さも指定するので、親の太さ（font-medium など）は継がない
 *
 * | 役割                                   | クラス       | サイズ                         | 行間 | 太さ |
 * | -------------------------------------- | ------------ | ------------------------------ | ---- | ---- |
 * | ページ見出し                           | text-h1      | 24〜28px（下の h1 のコメント） | 1.35 | 700  |
 * | セクション見出し                       | text-h2      | 22px                           | 1.4  | 700  |
 * | カード・パネル見出し                   | text-h3      | 18px                           | 1.45 | 600  |
 * | 本文（記事詳細・リーダーで読む要約）   | text-body    | 16px                           | 1.75 | 400  |
 * | 要約（一覧・カードの要約）             | text-summary | 14px                           | 1.7  | 400  |
 * | 補足（日付・件数）                     | text-caption | 12px                           | 1.5  | 400  |
 */
export const textStyles = {
  h1: {
    // 幅 400px 以下は 24px、600px 以上は 28px、その間は幅に合わせて大きくなる。
    // 長い記事タイトルがスマホで行数を取りすぎないようにする
    size: 'clamp(1.5rem, 1rem + 2vw, 1.75rem)',
    lineHeight: 1.35,
    weight: 700,
  },
  h2: { size: '1.375rem', lineHeight: 1.4, weight: 700 },
  h3: { size: '1.125rem', lineHeight: 1.45, weight: 600 },
  body: { size: '1rem', lineHeight: 1.75, weight: 400 },
  summary: { size: '0.875rem', lineHeight: 1.7, weight: 400 },
  caption: { size: '0.75rem', lineHeight: 1.5, weight: 400 },
} as const satisfies Record<string, TextStyleToken>;

/**
 * Shadow Tokens
 *
 * 影は1つのスケールだけを使う。shadowScale は Tailwind の @theme にも出力し、
 * `shadow-sm` などのユーティリティと `--tt-shadow-*` が同じ値になるようにする。
 * カード用の別名（cardRest / cardHover）もスケールの段を指す。
 */
export const shadowScale = {
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
} as const;

export const shadows: ShadowTokens = {
  ...shadowScale,
  cardRest: shadowScale.sm,
  cardHover: shadowScale.md,
  cardFocus: '0 0 0 2px var(--tt-color-primary)',
  glowPrimary: '0 0 12px var(--tt-color-primary-border)', // 新着バッジの発光（色は .dark で切り替わる）
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
};

/**
 * Spacing Tokens
 *
 * 4px base scale for consistent spacing across UI
 */
export const spacing: SpacingTokens = {
  '0': '0',
  '1': '0.25rem', // 4px
  '2': '0.5rem', // 8px
  '3': '0.75rem', // 12px
  '4': '1rem', // 16px
  '5': '1.25rem', // 20px
  '6': '1.5rem', // 24px
  '8': '2rem', // 32px
  '10': '2.5rem', // 40px
  '12': '3rem', // 48px
  '16': '4rem', // 64px
  '20': '5rem', // 80px
  '24': '6rem', // 96px
  '32': '8rem', // 128px
};

/**
 * Border Radius Tokens
 *
 * Tailwind の `rounded-xs`〜`rounded-4xl` もこの値を参照する（generated-tokens.css の @theme）
 */
export const radius: RadiusTokens = {
  none: '0',
  xs: '0.125rem', // 2px
  sm: '0.25rem', // 4px
  md: '0.375rem', // 6px
  lg: '0.5rem', // 8px
  xl: '0.75rem', // 12px
  '2xl': '1rem', // 16px
  '3xl': '1.5rem', // 24px
  '4xl': '2rem', // 32px
  full: '9999px', // Pill shape
};
