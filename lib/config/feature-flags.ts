/**
 * Feature Flags for TechTrend
 *
 * Centralized feature flag management for server-side only.
 * All flags are evaluated from environment variables.
 */

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
