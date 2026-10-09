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
