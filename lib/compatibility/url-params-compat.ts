/**
 * URL Params & Cookie Compatibility Layer
 *
 * Converts between legacy category-based params and new group-based params.
 * Guarded by FEATURE_FLAGS.USE_DATABASE_PROVIDER.
 */

import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import type { SourceCategoryId } from '@/lib/constants/source-categories';
import {
  getGroupIdsForCategories,
  getPrimaryCategoriesForGroups,
} from './category-group-mapping';

/**
 * Convert legacy category IDs to group IDs
 *
 * Used when reading old URLs/cookies and normalizing to new group-based state.
 *
 * @param categoryIds - Legacy SourceCategoryId array
 * @returns Group IDs (or original categoryIds if feature flag is off)
 */
export function convertCategoryToGroupParams(categoryIds: string[]): string[] {
  if (!FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
    return categoryIds;
  }

  return getGroupIdsForCategories(categoryIds as SourceCategoryId[]);
}

/**
 * Convert group IDs to legacy category IDs
 *
 * Used when writing new URLs/cookies for backward compatibility.
 *
 * @param groupIds - SourceGroup.id array from DB
 * @returns Legacy SourceCategoryId array (or original groupIds if feature flag is off)
 */
export function convertGroupToCategoryParams(groupIds: string[]): string[] {
  if (!FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
    return groupIds;
  }

  return getPrimaryCategoriesForGroups(groupIds);
}
