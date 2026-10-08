/**
 * TechTrend Design System - Design Tokens
 *
 * Centralized design tokens for colors, typography, spacing, shadows, and borders.
 * These tokens are the foundation of the design system and should be used
 * consistently across all components.
 *
 * Auto-generated CSS variables via `npm run generate:tokens`
 * （app/generated-tokens.css。shadcn/ui の変数と Tailwind の @theme もここから出力する）
 */

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
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
  full: string;
};

/**
 * 色の元になるパレット（Tailwind の同名パレットと同じ値）
 *
 * ニュートラルは slate の1系統だけを使う（ライト・ダークとも）。
 * ブランド色は緑1色。橙などの第2のアクセント色は置かない。
 */
const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
} as const;

const white = '#FFFFFF';

/** `#RRGGBB` を指定の不透明度の rgba() にする（淡い塗り・枠線を基準色から作るため） */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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

/**
 * Typography Tokens
 *
 * Fonts are loaded via Next.js `next/font/google` in app/layout.tsx
 */
export const typography: TypographyTokens = {
  family: {
    heading: "'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', monospace",
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
 * Tailwind の `rounded-sm`〜`rounded-3xl` もこの値を参照する（generated-tokens.css の @theme）
 */
export const radius: RadiusTokens = {
  none: '0',
  sm: '0.25rem', // 4px
  md: '0.375rem', // 6px
  lg: '0.5rem', // 8px
  xl: '0.75rem', // 12px
  '2xl': '1rem', // 16px
  '3xl': '1.5rem', // 24px
  full: '9999px', // Pill shape
};

/**
 * Design Tokens Aggregate
 *
 * Single source of truth for all design tokens
 */
/**
 * Category Colors - カテゴリ別カラートークン
 *
 * AI検索画面のカテゴリタイルで使用。各カテゴリを視覚的に差別化。
 *
 * 注意: これらの色はアイコン・装飾用途を想定しており、
 * 小さいテキストのWCAG AA基準（4.5:1）を満たさない組み合わせが含まれます。
 * テキスト表示には別途コントラスト比を確認してください。
 *
 * 利用方法（推奨）:
 * - scripts/dev/generate-css-tokens.ts が CSS 変数 `--tt-color-category-{category}-{variant}` を
 *   app/generated-tokens.css に出力するため、コンポーネント側では CSS 変数参照
 *   （例: `bg-[var(--tt-color-category-ai-bg)]`）を使うこと。CSS 変数経由なら
 *   ライト/ダーク切替は .dark スコープで自動処理される。
 * - 下記 lightCategoryColors / darkCategoryColors の TS 直参照は `@deprecated`。
 *   MutationObserver 等で手動切替する既存コードがあれば CSS 変数経由に移行すること。
 */
export type CategoryColorTokens = {
  bg: string;
  bgHover: string;
  icon: string;
  iconHover: string;
};

export type CategoryColors = {
  infrastructure: CategoryColorTokens;
  ai: CategoryColorTokens;
  frontend: CategoryColorTokens;
  backend: CategoryColorTokens;
  security: CategoryColorTokens;
  devops: CategoryColorTokens;
  database: CategoryColorTokens;
  mobile: CategoryColorTokens;
};

/**
 * @deprecated TS 直参照は段階的廃止予定。新規コードでは CSS 変数
 * `--tt-color-category-{category}-{variant}` を使用してください
 * （例: `bg-[var(--tt-color-category-ai-bg)]`）。
 */
export const lightCategoryColors: CategoryColors = {
  infrastructure: {
    bg: '#F1F5F9', // slate-100
    bgHover: '#E2E8F0', // slate-200
    icon: '#475569', // slate-600
    iconHover: '#334155', // slate-700
  },
  ai: {
    bg: '#EDE9FE', // violet-100
    bgHover: '#DDD6FE', // violet-200
    icon: '#7C3AED', // violet-600
    iconHover: '#6D28D9', // violet-700
  },
  frontend: {
    bg: '#DBEAFE', // blue-100
    bgHover: '#BFDBFE', // blue-200
    icon: '#2563EB', // blue-600
    iconHover: '#1D4ED8', // blue-700
  },
  backend: {
    bg: '#D1FAE5', // emerald-100
    bgHover: '#A7F3D0', // emerald-200
    icon: '#059669', // emerald-600
    iconHover: '#047857', // emerald-700
  },
  security: {
    bg: '#FEF3C7', // amber-100
    bgHover: '#FDE68A', // amber-200
    icon: '#D97706', // amber-600
    iconHover: '#B45309', // amber-700
  },
  devops: {
    bg: '#FCE7F3', // pink-100
    bgHover: '#FBCFE8', // pink-200
    icon: '#DB2777', // pink-600
    iconHover: '#BE185D', // pink-700
  },
  database: {
    bg: '#E0E7FF', // indigo-100
    bgHover: '#C7D2FE', // indigo-200
    icon: '#4F46E5', // indigo-600
    iconHover: '#4338CA', // indigo-700
  },
  mobile: {
    bg: '#CCFBF1', // teal-100
    bgHover: '#99F6E4', // teal-200
    icon: '#0D9488', // teal-600
    iconHover: '#0F766E', // teal-700
  },
};

/**
 * @deprecated TS 直参照は段階的廃止予定。新規コードでは CSS 変数
 * `--tt-color-category-{category}-{variant}` を使用してください
 * （例: `bg-[var(--tt-color-category-ai-bg)]`）。
 */
export const darkCategoryColors: CategoryColors = {
  infrastructure: {
    bg: '#1E293B', // slate-800
    bgHover: '#334155', // slate-700
    icon: '#94A3B8', // slate-400
    iconHover: '#CBD5E1', // slate-300
  },
  ai: {
    bg: '#2E1065', // violet-950
    bgHover: '#4C1D95', // violet-900
    icon: '#A78BFA', // violet-400
    iconHover: '#C4B5FD', // violet-300
  },
  frontend: {
    bg: '#1E3A5F', // blue-950 equivalent
    bgHover: '#1E40AF', // blue-800
    icon: '#60A5FA', // blue-400
    iconHover: '#93C5FD', // blue-300
  },
  backend: {
    bg: '#064E3B', // emerald-900
    bgHover: '#065F46', // emerald-800
    icon: '#34D399', // emerald-400
    iconHover: '#6EE7B7', // emerald-300
  },
  security: {
    bg: '#78350F', // amber-900
    bgHover: '#92400E', // amber-800
    icon: '#FBBF24', // amber-400
    iconHover: '#FCD34D', // amber-300
  },
  devops: {
    bg: '#831843', // pink-900
    bgHover: '#9D174D', // pink-800
    icon: '#F472B6', // pink-400
    iconHover: '#F9A8D4', // pink-300
  },
  database: {
    bg: '#312E81', // indigo-900
    bgHover: '#3730A3', // indigo-800
    icon: '#818CF8', // indigo-400
    iconHover: '#A5B4FC', // indigo-300
  },
  mobile: {
    bg: '#134E4A', // teal-900
    bgHover: '#115E59', // teal-800
    icon: '#2DD4BF', // teal-400
    iconHover: '#5EEAD4', // teal-300
  },
};

export const categoryColors = {
  light: lightCategoryColors,
  dark: darkCategoryColors,
} as const;

/**
 * Status Colors - 多色ステータス識別 UI 用トークン
 *
 * social-posts ダッシュボード等の複数状態を色で区別する画面で使用。
 * 8 論理状態（neutral/draft/reviewed/scheduled/posting/posted/failed/archived）× 2 variant
 * （text, iconBg）を light/dark で定義。
 *
 * 用途区分（@contrast-aa 注記）:
 * - `text` variant: テキスト表示想定。light/dark いずれも WCAG AA 4.5:1 以上を満たす
 *   （計測結果: .workflow/docs/notes/issue584_color_classification.md）。
 * - `iconBg` variant: アイコン・装飾背景想定。小テキストとの組み合わせでは使用しないこと。
 *
 * 設計方針: gradient（`from-amber-50 to-orange-50` のような Tailwind 文字列）は廃止し、
 * `bg` トークンによる単色背景に統一した（PR #609 / Issue #603 PR2 で追加）。
 * CSS 変数経由で参照できない 2 色補間は使用しない。
 *
 * 利用方法: `bg-[var(--tt-color-status-draft-icon-bg)]` / `text-[var(--tt-color-status-draft-text)]`
 * のように CSS 変数経由で参照すること。
 */
export type StatusColorTokens = {
  text: string;
  iconBg: string;
  bg: string;
};

export type StatusKey =
  | 'neutral'
  | 'draft'
  | 'reviewed'
  | 'scheduled'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'archived';

export type StatusColors = Record<StatusKey, StatusColorTokens>;

export const lightStatusColors: StatusColors = {
  neutral: {
    text: '#0F172A', // slate-900, AA on white 17.81:1
    iconBg: '#E2E8F0', // slate-200, decorative
    bg: '#F8FAFC', // slate-50, card background
  },
  draft: {
    text: '#B45309', // amber-700, AA on white 6.77:1
    iconBg: '#FEF3C7', // amber-100, decorative
    bg: '#FFFBEB', // amber-50, card background
  },
  reviewed: {
    text: '#0369A1', // sky-700, AA on white 5.71:1
    iconBg: '#E0F2FE', // sky-100, decorative
    bg: '#F0F9FF', // sky-50, card background
  },
  scheduled: {
    text: '#6D28D9', // violet-700, AA on white 7.24:1
    iconBg: '#EDE9FE', // violet-100, decorative
    bg: '#F5F3FF', // violet-50, card background
  },
  posting: {
    text: '#A16207', // yellow-700, AA on white 4.67:1
    iconBg: '#FEF9C3', // yellow-100, decorative
    bg: '#FEFCE8', // yellow-50, card background
  },
  posted: {
    text: '#047857', // emerald-700, AA on white 5.82:1
    iconBg: '#D1FAE5', // emerald-100, decorative
    bg: '#ECFDF5', // emerald-50, card background
  },
  failed: {
    text: '#BE123C', // rose-700, AA on white 6.18:1
    iconBg: '#FFE4E6', // rose-100, decorative
    bg: '#FFF1F2', // rose-50, card background
  },
  archived: {
    text: slate[500], // AA on white 4.76:1
    iconBg: slate[100], // decorative
    bg: slate[50], // card background
  },
};

export const darkStatusColors: StatusColors = {
  neutral: {
    text: '#F1F5F9', // slate-100
    iconBg: '#334155', // slate-700
    bg: 'rgba(15, 23, 42, 0.3)', // slate-900 @ 30%, card background
  },
  draft: {
    text: '#FBBF24', // amber-400
    iconBg: 'rgba(217, 119, 6, 0.4)', // amber-600 @ 40%
    bg: 'rgba(69, 26, 3, 0.3)', // amber-950 @ 30%, card background
  },
  reviewed: {
    text: '#38BDF8', // sky-400
    iconBg: 'rgba(2, 132, 199, 0.4)', // sky-600 @ 40%
    bg: 'rgba(8, 47, 73, 0.3)', // sky-950 @ 30%, card background
  },
  scheduled: {
    text: '#A78BFA', // violet-400
    iconBg: 'rgba(124, 58, 237, 0.4)', // violet-600 @ 40%
    bg: 'rgba(46, 16, 101, 0.3)', // violet-950 @ 30%, card background
  },
  posting: {
    text: '#FACC15', // yellow-400
    iconBg: 'rgba(202, 138, 4, 0.4)', // yellow-600 @ 40%
    bg: 'rgba(66, 32, 6, 0.3)', // yellow-950 @ 30%, card background
  },
  posted: {
    text: '#34D399', // emerald-400
    iconBg: 'rgba(5, 150, 105, 0.4)', // emerald-600 @ 40%
    bg: 'rgba(2, 44, 34, 0.3)', // emerald-950 @ 30%, card background
  },
  failed: {
    text: '#FB7185', // rose-400
    iconBg: 'rgba(225, 29, 72, 0.4)', // rose-600 @ 40%
    bg: 'rgba(76, 5, 25, 0.3)', // rose-950 @ 30%, card background
  },
  archived: {
    text: slate[400],
    iconBg: slate[800],
    bg: withAlpha(slate[900], 0.3), // card background
  },
};

export const statusColors = {
  light: lightStatusColors,
  dark: darkStatusColors,
} as const;

/**
 * Chart Colors - チャートの系列色
 *
 * 系列（タグ・ソースなど）を見分けるための色。状態色（positive / warning など）とは別に持ち、
 * 状態色の調整がチャートに波及しないようにする。塗りに文字を載せるときは
 * lib/utils/design-tokens/contrast.ts の readableTextColor で文字色を選ぶ。
 */
/** チャートの塗りに載せる文字の候補（readableTextColor で塗りごとに選ぶ） */
export const chartLabelTextColors = [white, slate[950]] as const;

export const chartColors = {
  light: [
    '#2563EB', // blue-600
    '#059669', // emerald-600
    '#EA580C', // orange-600
    '#DC2626', // red-600
    '#7C3AED', // violet-600
    '#DB2777', // pink-600
    '#0891B2', // cyan-600
    '#D97706', // amber-600
    '#4F46E5', // indigo-600
    '#0D9488', // teal-600
  ],
  dark: [
    '#60A5FA', // blue-400
    '#34D399', // emerald-400
    '#FB923C', // orange-400
    '#F87171', // red-400
    '#A78BFA', // violet-400
    '#F472B6', // pink-400
    '#22D3EE', // cyan-400
    '#FBBF24', // amber-400
    '#818CF8', // indigo-400
    '#2DD4BF', // teal-400
  ],
} as const satisfies Record<'light' | 'dark', readonly string[]>;

export const designTokens = {
  colors,
  categoryColors,
  statusColors,
  chartColors,
  typography,
  shadows,
  spacing,
  radius,
} as const;

export type DesignTokens = typeof designTokens;
