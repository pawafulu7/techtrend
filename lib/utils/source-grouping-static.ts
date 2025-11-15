/**
 * Static Source Grouping (Legacy)
 *
 * For Feature Flag = false path.
 * No Prisma dependency, client-safe.
 */

import type { GroupedSources } from '@/lib/types/source-grouping';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';

/**
 * Category ordering (for UI consistency)
 *
 * Note: Keys must match SourceCategoryId defined in source-categories.ts
 * ('foreign', 'domestic', 'company', 'presentation', 'ai', 'llm')
 */
const CATEGORY_ORDER: Record<string, number> = {
  company: 1,
  foreign: 2,
  domestic: 3,
  presentation: 4,
  ai: 5,
  llm: 6,
};

/**
 * Group sources using static SOURCE_CATEGORIES
 *
 * Client-safe (no async, no Prisma).
 * Compatible with database-backed grouping structure.
 *
 * @param sources - Source list
 * @returns Grouped sources with consistent ordering
 */
export function groupSourcesStatic(
  sources: Array<{ id: string; name: string }>
): GroupedSources[] {
  const result: GroupedSources[] = [];

  for (const [categoryId, category] of Object.entries(SOURCE_CATEGORIES)) {
    const categorySources = sources.filter(s => category.sourceIds.includes(s.id));

    // Skip empty groups (consistent with DB version)
    if (categorySources.length > 0) {
      result.push({
        group: {
          id: categoryId,
          name: category.name,
          type: categoryId,
          ordering: CATEGORY_ORDER[categoryId] || 99,
        },
        sources: categorySources,
      });
    }
  }

  // Sort by ordering (DB version consistency)
  return result.sort((a, b) => a.group.ordering - b.group.ordering);
}
