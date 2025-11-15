/**
 * Category-Group Mapping (Compatibility Layer)
 *
 * Maps legacy SourceCategoryId to new DB-backed SourceGroup IDs and vice versa.
 * Supports one-to-many mappings since some legacy categories were split across multiple groups.
 */

import type { SourceCategoryId } from '@/lib/constants/source-categories';

/**
 * Legacy Category → Group IDs (one-to-many)
 *
 * Examples:
 * - foreign: maps to group_company_global
 * - domestic: maps to group_community (primary) + others
 * - ai/llm: span group_company_global, group_academic, group_curated_domestic
 *
 * Note: This mapping is based on the actual SourceCategoryId type from source-categories.ts
 * which only includes: 'foreign', 'domestic', 'company', 'presentation', 'ai', 'llm'
 */
export const CATEGORY_TO_GROUPS: Record<SourceCategoryId, string[]> = {
  foreign: ['group_company_global'],
  domestic: ['group_community', 'group_academic', 'group_curated_domestic'],
  company: ['group_company_japan'],
  presentation: ['group_presentation'],
  ai: ['group_company_global', 'group_academic', 'group_curated_domestic'],
  llm: ['group_company_global', 'group_academic', 'group_curated_domestic'],
};

/**
 * Group ID → Primary Category (reverse lookup)
 *
 * Used for UI affordances (icons, labels, company filter)
 */
export const GROUP_TO_PRIMARY_CATEGORY: Record<string, SourceCategoryId> = {
  group_company_japan: 'company',
  group_company_global: 'foreign',
  group_community: 'domestic',
  group_academic: 'domestic',
  group_curated_domestic: 'domestic',
  group_presentation: 'presentation',
};

/**
 * Get group IDs for a legacy category ID
 *
 * @param categoryId - Legacy SourceCategoryId
 * @returns Array of group IDs (may be empty if unknown)
 */
export function getGroupIdsByCategoryId(categoryId: SourceCategoryId): string[] {
  return CATEGORY_TO_GROUPS[categoryId] || [];
}

/**
 * Get primary category ID for a group ID
 *
 * @param groupId - SourceGroup.id from DB
 * @returns Legacy SourceCategoryId (or undefined if unknown)
 */
export function getPrimaryCategoryByGroupId(groupId: string): SourceCategoryId | undefined {
  return GROUP_TO_PRIMARY_CATEGORY[groupId];
}

/**
 * Get all group IDs for multiple category IDs
 *
 * @param categoryIds - Array of legacy SourceCategoryId
 * @returns Flattened array of group IDs (duplicates removed)
 */
export function getGroupIdsForCategories(categoryIds: SourceCategoryId[]): string[] {
  const groupIds = categoryIds.flatMap(getGroupIdsByCategoryId);
  return Array.from(new Set(groupIds));
}

/**
 * Get all primary category IDs for multiple group IDs
 *
 * @param groupIds - Array of SourceGroup.id from DB
 * @returns Array of legacy SourceCategoryId (unknowns filtered out)
 */
export function getPrimaryCategoriesForGroups(groupIds: string[]): SourceCategoryId[] {
  const categoryIds = groupIds
    .map(getPrimaryCategoryByGroupId)
    .filter((id): id is SourceCategoryId => id != null);
  return Array.from(new Set(categoryIds));
}
