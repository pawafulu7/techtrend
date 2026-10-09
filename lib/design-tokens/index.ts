/**
 * TechTrend Design System - Design Tokens
 *
 * Centralized design tokens for colors, typography, spacing, shadows, and borders.
 * These tokens are the foundation of the design system and should be used
 * consistently across all components.
 *
 * Auto-generated CSS variables via `npm run generate:tokens`
 * （app/generated-tokens.css。shadcn/ui の変数と Tailwind の @theme もここから出力する）
 *
 * - colors.ts: ブランド色・ニュートラル・状態色と、shadcn/ui の変数への対応
 * - category.ts / status.ts / chart.ts: 用途を限った色（AI 検索のカテゴリ、投稿の状態、チャートの系列・
 *   記事グラフのノード・セクターマップの変化率）
 * - scales.ts: 文字・影・余白・角丸のスケール
 * - palette.ts: 上の色の元になるパレット。外からは withAlpha（不透明度を付ける）だけを使う
 */

import { categoryColors } from './category';
import { chartColors } from './chart';
import { colors } from './colors';
import { radius, shadows, spacing, typography } from './scales';
import { statusColors } from './status';

export * from './category';
export * from './chart';
export * from './colors';
export * from './scales';
export * from './status';
export { withAlpha } from './palette';

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
