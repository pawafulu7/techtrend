import { ink, night, white, withAlpha } from './palette';

export type ColorModeTokens = {
  background: string;
  canvas: string;
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
  // データの強さ（急上昇の成長率の段）だけに使う色。ボタン・飾り・状態の表示には使わない
  heat1: string;
  heat2: string;
  heat3: string;
  heat4: string;
};

/**
 * Color Palette - Light Mode
 *
 * 塗り（primary・状態色・順位色）には on* の文字色を載せる。どの組み合わせも
 * WCAG AA（4.5:1）を満たすことを __tests__/lib/design-tokens/contrast.test.ts で計算している。
 * 状態色（positive / warning / negative / info）は状態を伝える表示だけに使い、装飾や操作ボタンには primary を使う。
 */
// 状態色は、淡い塗り（10%）をホバー面（ink-150）に重ねた上の文字が 4.5:1 に届く範囲で、最も明るい色にしている
const lightPrimary = '#3A3FC0'; // 藍（白文字 7.9:1）
const lightPositive = '#136B35'; // green-800 寄り
const lightWarning = '#A8380D'; // orange-800 寄り
const lightNegative = '#B91C1C'; // red-700
// info は藍のブランドと見分けられるようシアン系にする
const lightInfo = '#0B6A82'; // cyan-800 寄り

export const lightColors: ColorModeTokens = {
  background: white, // ページの背景
  // 全画面の下地（main に敷く）。白いカードとヘッダーを浮かせるため一段沈める。無地（#764 のグラデーションはやめた）
  canvas: ink[100],
  primary: lightPrimary,
  primaryHover: '#2F33A3',
  primaryBg: withAlpha(lightPrimary, 0.1), // 淡い塗り（未読などのバッジ）
  primaryBorder: withAlpha(lightPrimary, 0.3),
  onPrimary: white,
  surface: white, // カードの背景
  surfaceMuted: ink[50], // カード内の一段沈んだ面
  surfaceHover: ink[150], // ホバー・muted の面
  text: ink[900],
  textMuted: ink[600],
  border: ink[200],
  borderHover: ink[300],
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
  rankSilver: '#5E6785',
  rankBronze: '#C2410C', // orange-700
  onRank: white,
  // 観測画像の疑似カラー（藍 → 紫 → 赤紫 → 橙）。文字としても置くので、どの面の上でも 4.5:1 以上
  heat1: '#5B4BD6',
  heat2: '#A23BB5',
  heat3: '#BE2B57',
  heat4: '#B83A0B',
};

/**
 * Color Palette - Dark Mode
 *
 * 塗りは明るい色にし、上には暗い文字（night-950）を載せる。
 */
const darkPrimary = '#A3ADFF'; // 藍の明るい色
const darkPositive = '#22C55E'; // green-500
const darkWarning = '#FB923C'; // orange-400
const darkNegative = '#F87171'; // red-400
const darkInfo = '#22D3EE'; // cyan-400

export const darkColors: ColorModeTokens = {
  background: night[950],
  canvas: night[950],
  primary: darkPrimary,
  primaryHover: '#8C97F5',
  primaryBg: withAlpha(darkPrimary, 0.1),
  primaryBorder: withAlpha(darkPrimary, 0.4),
  onPrimary: night[950],
  surface: night[900],
  surfaceMuted: night[925],
  surfaceHover: night[850],
  text: night[100],
  textMuted: ink[400],
  border: night[800],
  borderHover: night[700],
  positive: darkPositive,
  positiveBg: withAlpha(darkPositive, 0.1),
  positiveBorder: withAlpha(darkPositive, 0.4),
  onPositive: night[950],
  warning: darkWarning,
  warningBg: withAlpha(darkWarning, 0.1),
  warningBorder: withAlpha(darkWarning, 0.4),
  onWarning: night[950],
  negative: darkNegative,
  negativeBg: withAlpha(darkNegative, 0.1),
  negativeBorder: withAlpha(darkNegative, 0.4),
  onNegative: night[950],
  info: darkInfo,
  infoBg: withAlpha(darkInfo, 0.1),
  infoBorder: withAlpha(darkInfo, 0.4),
  onInfo: night[950],
  rankGold: '#D97706', // amber-600
  rankSilver: ink[400],
  rankBronze: '#EA580C', // orange-600
  onRank: night[950],
  heat1: '#8C7DFF',
  heat2: '#D27BEA',
  heat3: '#FF7A9B',
  heat4: '#FFA25C',
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
