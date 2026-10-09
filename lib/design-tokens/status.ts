import { slate, withAlpha } from './palette';

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
