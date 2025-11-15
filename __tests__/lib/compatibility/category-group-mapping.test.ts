import {
  CATEGORY_TO_GROUPS,
  GROUP_TO_PRIMARY_CATEGORY,
  getGroupIdsByCategoryId,
  getPrimaryCategoryByGroupId,
  getGroupIdsForCategories,
  getPrimaryCategoriesForGroups,
} from '@/lib/compatibility/category-group-mapping';
import type { SourceCategoryId } from '@/lib/constants/source-categories';

describe('category-group-mapping', () => {
  describe('CATEGORY_TO_GROUPS', () => {
    it('should map company to group_company_japan', () => {
      expect(CATEGORY_TO_GROUPS.company).toEqual(['group_company_japan']);
    });

    it('should map foreign to multiple groups', () => {
      expect(CATEGORY_TO_GROUPS.foreign).toEqual([
        'group_company_global',
        'group_community',
        'group_academic',
      ]);
    });

    it('should map ai to multiple groups', () => {
      expect(CATEGORY_TO_GROUPS.ai).toEqual([
        'group_company_global',
        'group_academic',
        'group_curated_domestic',
      ]);
    });

    it('should map llm to multiple groups', () => {
      expect(CATEGORY_TO_GROUPS.llm).toEqual([
        'group_company_global',
        'group_academic',
        'group_curated_domestic',
      ]);
    });
  });

  describe('GROUP_TO_PRIMARY_CATEGORY', () => {
    it('should map group_company_japan to company', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_company_japan).toBe('company');
    });

    it('should map group_company_global to foreign', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_company_global).toBe('foreign');
    });

    it('should map group_community to community', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_community).toBe('community');
    });

    it('should map group_academic to academic', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_academic).toBe('academic');
    });

    it('should map group_curated_domestic to curated_domestic', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_curated_domestic).toBe('curated_domestic');
    });

    it('should map group_presentation to presentation', () => {
      expect(GROUP_TO_PRIMARY_CATEGORY.group_presentation).toBe('presentation');
    });
  });

  describe('getGroupIdsByCategoryId', () => {
    it('should return group IDs for company category', () => {
      const result = getGroupIdsByCategoryId('company' as SourceCategoryId);
      expect(result).toEqual(['group_company_japan']);
    });

    it('should return group IDs for foreign category', () => {
      const result = getGroupIdsByCategoryId('foreign' as SourceCategoryId);
      expect(result).toEqual([
        'group_company_global',
        'group_community',
        'group_academic',
      ]);
    });

    it('should return empty array for unknown category', () => {
      const result = getGroupIdsByCategoryId('unknown' as SourceCategoryId);
      expect(result).toEqual([]);
    });
  });

  describe('getPrimaryCategoryByGroupId', () => {
    it('should return company for group_company_japan', () => {
      const result = getPrimaryCategoryByGroupId('group_company_japan');
      expect(result).toBe('company');
    });

    it('should return foreign for group_company_global', () => {
      const result = getPrimaryCategoryByGroupId('group_company_global');
      expect(result).toBe('foreign');
    });

    it('should return undefined for unknown group', () => {
      const result = getPrimaryCategoryByGroupId('unknown_group');
      expect(result).toBeUndefined();
    });
  });

  describe('getGroupIdsForCategories', () => {
    it('should return flattened group IDs for multiple categories', () => {
      const result = getGroupIdsForCategories([
        'company' as SourceCategoryId,
        'foreign' as SourceCategoryId,
      ]);
      expect(result).toEqual([
        'group_company_japan',
        'group_company_global',
        'group_community',
        'group_academic',
      ]);
    });

    it('should remove duplicates', () => {
      const result = getGroupIdsForCategories([
        'ai' as SourceCategoryId,
        'llm' as SourceCategoryId,
      ]);
      // ai and llm map to the same groups, so duplicates should be removed
      expect(result).toEqual([
        'group_company_global',
        'group_academic',
        'group_curated_domestic',
      ]);
    });

    it('should return empty array for empty input', () => {
      const result = getGroupIdsForCategories([]);
      expect(result).toEqual([]);
    });
  });

  describe('getPrimaryCategoriesForGroups', () => {
    it('should return category IDs for multiple groups', () => {
      const result = getPrimaryCategoriesForGroups([
        'group_company_japan',
        'group_company_global',
      ]);
      expect(result).toEqual(['company', 'foreign']);
    });

    it('should filter out unknown groups', () => {
      const result = getPrimaryCategoriesForGroups([
        'group_company_japan',
        'unknown_group',
        'group_community',
      ]);
      expect(result).toEqual(['company', 'community']);
    });

    it('should return empty array for empty input', () => {
      const result = getPrimaryCategoriesForGroups([]);
      expect(result).toEqual([]);
    });

    it('should remove duplicates', () => {
      const result = getPrimaryCategoriesForGroups([
        'group_company_japan',
        'group_company_japan',
      ]);
      expect(result).toEqual(['company']);
    });
  });
});
