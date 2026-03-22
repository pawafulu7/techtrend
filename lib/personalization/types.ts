/**
 * Personalization Types
 *
 * Type definitions for the article personalization feature.
 */

// =============================================================================
// Scope Types
// =============================================================================

/**
 * Preference scope determines where category preferences apply.
 * - 'home': Home page article filtering
 * - 'digest': Digest page article filtering
 */
export type PreferenceScope = 'home' | 'digest';

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
 */
export interface UserCategoryPreferences {
  selectedCategories: string[];
  filterEnabled: boolean;
  periodMonths: number;
  isAuthenticated?: boolean;
  scope?: PreferenceScope;
}

/**
 * User category preference update request
 */
export interface UpdateCategoryPreferencesRequest {
  categoryIds: string[];
  filterEnabled?: boolean;
  periodMonths?: number;
  scope?: PreferenceScope;
}

// =============================================================================
// Filtering Types
// =============================================================================

/**
 * Period preset options (months)
 */
export type PeriodPreset = 3 | 6 | 12 | 0; // 0 = all time

/**
 * Filtering options for personalized article search
 */
export interface PersonalizedFilterOptions {
  categoryIds: string[];
  periodMonths: number;
  limit: number;
  offset?: number;
  sortBy?: PersonalizedSortBy;
  sortOrder?: 'asc' | 'desc';
  excludeSourceIds?: string[];
  topK?: number;
  maxConcurrency?: number;
}

/**
 * Scored article result from personalized filtering
 */
export interface ScoredArticle {
  articleId: string;
  embeddingSimilarity: number;
  tagBoost: number;
  recencyDecay: number;
  finalScore: number;
}

/**
 * Personalized filter result metadata
 */
export interface PersonalizedFilterMeta {
  filterMode: 'category';
  appliedCategories: string[];
  periodMonths: number;
  totalMatched: number;
  queryMs: number;
}

export type PersonalizedSortBy =
  | 'finalScore'
  | 'publishedAt'
  | 'createdAt'
  | 'qualityScore'
  | 'bookmarks'
  | 'userVotes';

// =============================================================================
// Centroid Types
// =============================================================================

/**
 * Category centroid data
 */
export interface CategoryCentroid {
  categoryId: string;
  embedding: number[];
  computedAt: Date;
  sampleCount: number;
}

/**
 * Centroid computation result
 */
export interface CentroidComputationResult {
  categoryId: string;
  slug?: string;
  success: boolean;
  sampleCount?: number;
  error?: string;
}

// =============================================================================
// Score Calculation Constants
// =============================================================================

/**
 * Score calculation parameters
 */
export interface ScoreParameters {
  tagBoostAlpha: number; // Weight for tag match bonus (0.03-0.05)
  recencyBeta: number; // Weight for recency decay (0.1)
  halfLifeDays: number; // Half-life for recency decay (365)
  minSimilarityThreshold: number; // Minimum similarity to include (0.55)
  topKCandidates: number; // Number of candidates to retrieve (200)
}

/**
 * Default score parameters
 */
export const DEFAULT_SCORE_PARAMETERS: ScoreParameters = {
  tagBoostAlpha: 0.03,
  recencyBeta: 0.1,
  halfLifeDays: 365,
  minSimilarityThreshold: 0.55,
  topKCandidates: 200,
};
