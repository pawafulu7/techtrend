/**
 * Shared types for Articles API
 */

import type { Prisma } from '@prisma/client';
import type { ArticleWithRelations } from '@/types/models';
import type { PaginatedResponse } from '@/lib/types/api';

/**
 * User-specific article data (favorites, read status)
 */
export interface UserSpecificArticleData {
  favoritedArticleIds: Set<string>;
  readArticleIds: Set<string>;
}

/**
 * User data overlay for articles
 */
export interface ArticleUserOverlay {
  isFavorited: boolean;
  isRead: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * Filter parameters for article queries
 */
export interface FilterParams {
  sources?: string;
  sourceId?: string;
  tag?: string;
  tags?: string;
  tagMode?: string;
  search?: string;
  dateRange?: string;
  category?: string;
  readFilter?: string;
}

/**
 * Display options for article queries
 */
export interface DisplayOptions {
  includeRelations: boolean;
  includeEmptyContent: boolean;
  excludeUnprocessed: boolean;
  lightweight: boolean;
  fields?: string;
  includeUserData: boolean;
}

/**
 * Personalization parameters
 */
export interface PersonalizationParams {
  categoryIds: string[];
  periodMonths: number;
}

/**
 * Parsed query parameters from request
 */
export interface ParsedQueryParams {
  pagination: PaginationParams;
  filters: FilterParams;
  display: DisplayOptions;
  personalization: PersonalizationParams;
  normalizedSearch: string;
  normalizedSources: string;
}

/**
 * Cache parameters for LayeredCache
 */
export interface ArticleCacheParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  sources: string;
  sourceId?: string;
  tag?: string;
  tags?: string;
  tagMode?: string;
  search?: string;
  dateRange?: string;
  readFilter?: string;
  userId?: string;
  category?: string;
  includeRelations: boolean;
  includeEmptyContent: boolean;
  excludeUnprocessed: boolean;
  lightweight: boolean;
  fields?: string;
  includeUserData: boolean;
}

/**
 * Result type for article queries
 */
export type ArticleQueryResult = PaginatedResponse<ArticleWithRelations>;

/**
 * Prisma where input type alias
 */
export type ArticleWhereInput = Prisma.ArticleWhereInput;

/**
 * Prisma select type alias
 */
export type ArticleSelect = Prisma.ArticleSelect;

/**
 * Allowed selectable fields for dynamic field selection
 */
export const ALLOWED_SELECTABLE_FIELDS = new Set([
  'title',
  'url',
  'summary',
  'thumbnail',
  'publishedAt',
  'qualityScore',
  'bookmarks',
  'userVotes',
  'difficulty',
  'createdAt',
  'updatedAt',
  'sourceId',
  'summaryVersion',
  'articleType',
  'category',
  'detailedSummary',
]);

/**
 * Valid sort fields for article queries
 */
export const VALID_SORT_FIELDS = [
  'publishedAt',
  'createdAt',
  'qualityScore',
  'bookmarks',
  'userVotes',
  'finalScore',
] as const;

export type ValidSortField = (typeof VALID_SORT_FIELDS)[number];
