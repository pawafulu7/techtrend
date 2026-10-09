import { slate, white, withAlpha } from './palette';

export type ColorModeTokens = {
  background: string;
  primary: string;
  primaryHover: string;
  primaryBg: string;
  primaryBorder: string;
  onPrimary: string;
  surface: string;
  surfaceMuted: string;
  surfaceHover: string;
  text: string;
  textMuted: string;
  border: string;
  borderHover: string;
  positive: string;
  positiveBg: string;
  positiveBorder: string;
  onPositive: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  onWarning: string;
  negative: string;
  negativeBg: string;
  negativeBorder: string;
  onNegative: string;
  info: string;
  infoBg: string;
  infoBorder: string;
  onInfo: string;
  rankGold: string;
  rankSilver: string;
  rankBronze: string;
  onRank: string;
};

/**
 * Color Palette - Light Mode
 *
 * 塗り（primary・状態色・順位色）には on* の文字色を載せる。どの組み合わせも
 * WCAG AA（4.5:1）を満たすことを __tests__/lib/design-tokens/contrast.test.ts で計算している。
 * 状態色（positive / warning / negative / info）は状態を伝える表示だけに使い、装飾や操作ボタンには primary を使う。
 */
// primary・positive・warning は Tailwind の 700 と 800 の間の色。700 番では、淡い塗り（10%）を
// slate-100 に重ねた上の文字が 4.5:1 に届かないため、届く範囲で最も明るい色にしている
const lightPrimary = '#157439'; // green-700〜800（白文字 5.9:1）
const lightPositive = '#157439';
const lightWarning = '#B43C0E'; // orange-700〜800（白文字 5.8:1）
const lightNegative = '#B91C1C'; // red-700
const lightInfo = '#1D4ED8'; // blue-700

export const lightColors: ColorModeTokens = {
  background: white, // ページの背景
  primary: lightPrimary,
  primaryHover: '#166534', // green-800
  primaryBg: withAlpha(lightPrimary, 0.1), // 淡い塗り（未読などのバッジ）
  primaryBorder: withAlpha(lightPrimary, 0.3),
  onPrimary: white,
  surface: white, // カードの背景
  surfaceMuted: slate[50], // カード内の一段沈んだ面
  surfaceHover: slate[100], // ホバー・muted の面
  text: slate[900],
  // slate-500 だと slate-100（muted・ホバー面）の上で 4.34:1 になるため、600 側へ少し寄せている
  textMuted: '#617087',
  border: slate[200],
  borderHover: slate[300],
  positive: lightPositive,
  positiveBg: withAlpha(lightPositive, 0.1),
  positiveBorder: withAlpha(lightPositive, 0.3),
  onPositive: white,
  warning: lightWarning,
  warningBg: withAlpha(lightWarning, 0.1),
  warningBorder: withAlpha(lightWarning, 0.3),
  onWarning: white,
  negative: lightNegative,
  negativeBg: withAlpha(lightNegative, 0.1),
  negativeBorder: withAlpha(lightNegative, 0.3),
  onNegative: white,
  info: lightInfo,
  infoBg: withAlpha(lightInfo, 0.1),
  infoBorder: withAlpha(lightInfo, 0.3),
  onInfo: white,
  rankGold: '#B45309', // amber-700
  rankSilver: slate[500],
  rankBronze: '#C2410C', // orange-700
  onRank: white,
};

/**
 * Color Palette - Dark Mode
 *
 * 塗りは明るい色（400〜500番台）にし、上には暗い文字（slate-950）を載せる。
 */
const darkPrimary = '#22C55E'; // green-500
const darkPositive = '#22C55E'; // green-500
const darkWarning = '#FB923C'; // orange-400
const darkNegative = '#F87171'; // red-400
const darkInfo = '#60A5FA'; // blue-400

export const darkColors: ColorModeTokens = {
  background: slate[950],
  primary: darkPrimary,
  primaryHover: '#16A34A', // green-600
  primaryBg: withAlpha(darkPrimary, 0.1),
  primaryBorder: withAlpha(darkPrimary, 0.4),
  onPrimary: slate[950],
  surface: slate[900],
  surfaceMuted: slate[950],
  surfaceHover: slate[800],
  text: slate[200],
  textMuted: slate[400],
  border: slate[800],
  borderHover: slate[700],
  positive: darkPositive,
  positiveBg: withAlpha(darkPositive, 0.1),
  positiveBorder: withAlpha(darkPositive, 0.4),
  onPositive: slate[950],
  warning: darkWarning,
  warningBg: withAlpha(darkWarning, 0.1),
  warningBorder: withAlpha(darkWarning, 0.4),
  onWarning: slate[950],
  negative: darkNegative,
  negativeBg: withAlpha(darkNegative, 0.1),
  negativeBorder: withAlpha(darkNegative, 0.4),
  onNegative: slate[950],
  info: darkInfo,
  infoBg: withAlpha(darkInfo, 0.1),
  infoBorder: withAlpha(darkInfo, 0.4),
  onInfo: slate[950],
  rankGold: '#D97706', // amber-600
  rankSilver: slate[400],
  rankBronze: '#EA580C', // orange-600
  onRank: slate[950],
};

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;

/**
 * shadcn/ui の CSS 変数（`--background` `--primary` など）と TT トークンの対応
 *
 * shadcn の変数は値を持たず、すべて TT トークンから作る。globals.css が読み込む
 * generated-tokens.css と、layout.tsx の Critical CSS はどちらもこの関数の出力を使う。
 */
export function shadcnColorVars(c: ColorModeTokens) {
  return {
    background: c.background,
    foreground: c.text,
    card: c.surface,
    'card-foreground': c.text,
    popover: c.surface,
    'popover-foreground': c.text,
    primary: c.primary,
    'primary-foreground': c.onPrimary,
    secondary: c.surfaceHover,
    'secondary-foreground': c.text,
    muted: c.surfaceHover,
    'muted-foreground': c.textMuted,
    accent: c.surfaceHover,
    'accent-foreground': c.text,
    destructive: c.negative,
    'destructive-foreground': c.onNegative,
    border: c.border,
    input: c.border,
    ring: c.primary,
    sidebar: c.surfaceMuted,
    'sidebar-foreground': c.text,
    'sidebar-primary': c.primary,
    'sidebar-primary-foreground': c.onPrimary,
    'sidebar-accent': c.surfaceHover,
    'sidebar-accent-foreground': c.text,
    'sidebar-border': c.border,
    'sidebar-ring': c.primary,
  };
}
