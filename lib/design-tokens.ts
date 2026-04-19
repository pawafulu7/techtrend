/**
 * TechTrend Design System - Design Tokens
 *
 * Centralized design tokens for colors, typography, spacing, shadows, and borders.
 * These tokens are the foundation of the design system and should be used
 * consistently across all components.
 *
 * Auto-generated CSS variables via `npm run generate:tokens`
 */

export type ColorModeTokens = {
  primary: string;
  primaryHover: string;
  primaryAccent: string;
  onPrimary: string;
  secondary: string;
  secondaryHover: string;
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
  warning: string;
  negative: string;
  negativeBg: string;
  negativeBorder: string;
  info: string;
  infoBg: string;
  infoBorder: string;
  rankGold: string;
  rankSilver: string;
  rankBronze: string;
};

export type ShadowTokens = {
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
 * Color Palette - Light Mode
 *
 * WCAG AA Compliance:
 * - primary (#16A34A) on background: 4.6:1 (AA)
 * - text (#0B1221) on background: 15.8:1 (AAA)
 */
export const lightColors: ColorModeTokens = {
  primary: '#16A34A', // Green (AA-compliant: 4.6:1)
  primaryHover: '#15803D', // Darker green
  primaryAccent: '#22C55E', // Lighter green (for badges/icons/large text)
  onPrimary: '#FFFFFF', // White text on primary buttons
  secondary: '#F97316', // Orange
  secondaryHover: '#EA580C', // Darker orange
  surface: '#FFFFFF', // Card background
  surfaceMuted: '#F8FAFC', // Off-white background
  surfaceHover: '#F1F5F9', // Card hover state
  text: '#0F172A', // Dark slate (high contrast)
  textMuted: '#64748B', // Muted gray for secondary text
  border: '#E5E7EB', // Light gray border
  borderHover: '#D1D5DB', // Darker border on hover
  positive: '#22C55E', // Green (success)
  positiveBg: 'rgba(34, 197, 94, 0.1)', // Green with 10% alpha (badge bg)
  positiveBorder: 'rgba(34, 197, 94, 0.3)', // Green with 30% alpha (badge border)
  warning: '#F97316', // Orange (warning)
  negative: '#EF4444', // Red (error)
  negativeBg: 'rgba(239, 68, 68, 0.1)', // Red with 10% alpha (badge bg)
  negativeBorder: 'rgba(239, 68, 68, 0.3)', // Red with 30% alpha (badge border)
  info: '#3B82F6', // Blue (info)
  infoBg: 'rgba(59, 130, 246, 0.1)', // Blue with 10% alpha (badge bg)
  infoBorder: 'rgba(59, 130, 246, 0.3)', // Blue with 30% alpha (badge border)
  rankGold: '#B45309', // Amber-800 (AA-compliant: 5.0:1 on white)
  rankSilver: '#64748B', // Slate-500 (AA-compliant: 4.76:1 on white)
  rankBronze: '#C2410C', // Orange-800 (AA-compliant: 5.0:1 on white)
};

/**
 * Color Palette - Dark Mode
 *
 * WCAG AA Compliance:
 * - primary (#22C55E) on background: 4.8:1 (AA)
 * - text (#E5E7EB) on background: 14.2:1 (AAA)
 */
export const darkColors: ColorModeTokens = {
  primary: '#22C55E', // Brighter green in dark mode
  primaryHover: '#16A34A', // Darker green
  primaryAccent: '#4ADE80', // Lighter accent
  onPrimary: '#000000', // Black text on primary buttons in dark mode
  secondary: '#F97316', // Orange
  secondaryHover: '#EA580C', // Darker orange
  surface: '#111827', // Card background
  surfaceMuted: '#0B1220', // Deep blue-black background
  surfaceHover: '#1F2937', // Card hover state
  text: '#E5E7EB', // Light gray (high contrast)
  textMuted: '#94A3B8', // Muted gray
  border: '#1F2937', // Dark gray border
  borderHover: '#374151', // Lighter border on hover
  positive: '#22C55E', // Green
  positiveBg: 'rgba(34, 197, 94, 0.15)', // Green with 15% alpha (badge bg in dark mode)
  positiveBorder: 'rgba(34, 197, 94, 0.4)', // Green with 40% alpha (badge border)
  warning: '#F97316', // Orange
  negative: '#EF4444', // Red
  negativeBg: 'rgba(239, 68, 68, 0.15)', // Red with 15% alpha (badge bg)
  negativeBorder: 'rgba(239, 68, 68, 0.4)', // Red with 40% alpha (badge border)
  info: '#3B82F6', // Blue
  infoBg: 'rgba(59, 130, 246, 0.15)', // Blue with 15% alpha (badge bg)
  infoBorder: 'rgba(59, 130, 246, 0.4)', // Blue with 40% alpha (badge border)
  rankGold: '#D97706', // Amber-700 (AA-compliant: 5.57:1 on dark bg)
  rankSilver: '#94A3B8', // Slate-400 (AA-compliant: 6.92:1 on dark bg)
  rankBronze: '#EA580C', // Orange-700 (AA-compliant: 4.98:1 on dark bg)
};

export const colors = {
  light: lightColors,
  dark: darkColors,
} as const;

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
 * Soft shadows for modern, layered UI feel
 */
export const shadows: ShadowTokens = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  cardRest: '0 2px 8px -2px rgb(0 0 0 / 0.08)',
  cardHover:
    '0 8px 16px -4px rgb(0 0 0 / 0.12), 0 4px 8px -2px rgb(0 0 0 / 0.08)',
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
 * Modern, rounded corners for softer UI feel
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
 * 設計方針: gradient（`from-amber-50 to-orange-50` のような Tailwind 文字列）は CSS 変数化せず、
 * コンポーネント側で Tailwind クラスをそのまま保持する。CSS 変数経由で表現できない 2 色
 * 補間を扱うため。
 *
 * 利用方法: `bg-[var(--tt-color-status-draft-icon-bg)]` / `text-[var(--tt-color-status-draft-text)]`
 * のように CSS 変数経由で参照すること。
 */
export type StatusColorTokens = {
  text: string;
  iconBg: string;
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
  },
  draft: {
    text: '#B45309', // amber-700, AA on white 6.77:1
    iconBg: '#FEF3C7', // amber-100, decorative
  },
  reviewed: {
    text: '#0369A1', // sky-700, AA on white 5.71:1
    iconBg: '#E0F2FE', // sky-100, decorative
  },
  scheduled: {
    text: '#6D28D9', // violet-700, AA on white 7.24:1
    iconBg: '#EDE9FE', // violet-100, decorative
  },
  posting: {
    text: '#A16207', // yellow-700, AA on white 4.67:1
    iconBg: '#FEF9C3', // yellow-100, decorative
  },
  posted: {
    text: '#047857', // emerald-700, AA on white 5.82:1
    iconBg: '#D1FAE5', // emerald-100, decorative
  },
  failed: {
    text: '#BE123C', // rose-700, AA on white 6.18:1
    iconBg: '#FFE4E6', // rose-100, decorative
  },
  archived: {
    text: '#6B7280', // gray-500, AA on white 4.83:1
    iconBg: '#F3F4F6', // gray-100, decorative
  },
};

export const darkStatusColors: StatusColors = {
  neutral: {
    text: '#F1F5F9', // slate-100
    iconBg: '#334155', // slate-700
  },
  draft: {
    text: '#FBBF24', // amber-400
    iconBg: 'rgba(217, 119, 6, 0.4)', // amber-600 @ 40%
  },
  reviewed: {
    text: '#38BDF8', // sky-400
    iconBg: 'rgba(2, 132, 199, 0.4)', // sky-600 @ 40%
  },
  scheduled: {
    text: '#A78BFA', // violet-400
    iconBg: 'rgba(124, 58, 237, 0.4)', // violet-600 @ 40%
  },
  posting: {
    text: '#FACC15', // yellow-400
    iconBg: 'rgba(202, 138, 4, 0.4)', // yellow-600 @ 40%
  },
  posted: {
    text: '#34D399', // emerald-400
    iconBg: 'rgba(5, 150, 105, 0.4)', // emerald-600 @ 40%
  },
  failed: {
    text: '#FB7185', // rose-400
    iconBg: 'rgba(225, 29, 72, 0.4)', // rose-600 @ 40%
  },
  archived: {
    text: '#9CA3AF', // gray-400
    iconBg: '#1F2937', // gray-800
  },
};

export const statusColors = {
  light: lightStatusColors,
  dark: darkStatusColors,
} as const;

export const designTokens = {
  colors,
  categoryColors,
  statusColors,
  typography,
  shadows,
  spacing,
  radius,
} as const;

export type DesignTokens = typeof designTokens;
