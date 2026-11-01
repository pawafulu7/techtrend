/**
 * Feature Flags for TechTrend
 *
 * 機能フラグはこのファイルにまとめる。値はすべて環境変数から読む。
 */

// NOTE: This file is imported by client components (source-presets.ts, primary-nav.ts).
// Do NOT import from env.ts (server-only due to pino/zod dependencies).
export const FEATURE_FLAGS = {
  /**
   * Enable database-backed provider for company sources
   *
   * When true, uses DatabaseCompanySourceProvider (Phase 2-A)
   * When false, uses StaticCompanySourceProvider (legacy)
   *
   * Default: false
   * Environment: USE_DATABASE_PROVIDER
   */
  USE_DATABASE_PROVIDER: process.env.USE_DATABASE_PROVIDER === 'true',
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;

/**
 * 画面の出し分けに使うフラグ。クライアントでも読むので NEXT_PUBLIC_ の環境変数だけを使う
 */
export const features = {
  /** AI エージェント検索（/search/agent）を出す。Environment: NEXT_PUBLIC_ENABLE_AI_SEARCH */
  aiSearch: process.env.NEXT_PUBLIC_ENABLE_AI_SEARCH === 'true',
} as const;
