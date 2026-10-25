/**
 * Personalization Types
 *
 * Type definitions for the article personalization feature.
 */

// =============================================================================
// Interest Category Types
// =============================================================================

/**
 * Interest category slug identifiers
 */
export type InterestCategorySlug =
  | 'frontend'
  | 'backend'
  | 'cloud'
  | 'database'
  | 'ai-ml'
  | 'security'
  | 'devops';

/**
 * Interest category definition for seeding and configuration
 */
export interface InterestCategoryDefinition {
  slug: InterestCategorySlug;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  tagPatterns: string[];
}

/**
 * Interest category (API response)
 */
export interface InterestCategoryWithCount {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

// =============================================================================
// User Preference Types
// =============================================================================

/**
 * User category preferences (API response)
 *
 * 分野の設定はホームとダイジェストで共通（Issue #709）。ホームの一覧を絞り込むかどうかは
 * filterEnabled で別に持ち、ダイジェストは filterEnabled に関係なく分野を使う。
 */
export interface UserCategoryPreferences {
  selectedCategories: string[];
  /** ホームの一覧を分野で絞り込むか（分野が 0 件なら常に false） */
  filterEnabled: boolean;
  periodMonths: number;
  isAuthenticated?: boolean;
}

/**
 * User category preference update request
 */
export interface UpdateCategoryPreferencesRequest {
  /** 分野。省略すると今の分野のまま（ホームのスイッチ・期間だけを変えるとき） */
  categoryIds?: string[];
  /** ホームの一覧を絞り込むか。省略すると今の値のまま（ダイジェストから分野だけを保存するとき） */
  filterEnabled?: boolean;
  periodMonths?: number;
}

// =============================================================================
// Period Types
// =============================================================================

/**
 * Period preset options (months)
 */
export type PeriodPreset = 3 | 6 | 12 | 0; // 0 = all time
