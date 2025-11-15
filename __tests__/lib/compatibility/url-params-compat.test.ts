import {
  convertCategoryToGroupParams,
  convertGroupToCategoryParams,
} from '@/lib/compatibility/url-params-compat';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

describe('url-params-compat', () => {
  describe('convertCategoryToGroupParams', () => {
    it('should convert category IDs to group IDs when feature flag is true', () => {
      // Assuming FEATURE_FLAGS.USE_DATABASE_PROVIDER is true
      if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertCategoryToGroupParams(['company', 'foreign']);
        expect(result).toEqual(['group_company_japan', 'group_company_global']);
      }
    });

    it('should remove duplicates when converting', () => {
      if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertCategoryToGroupParams(['ai', 'llm']);
        // ai and llm map to the same groups
        expect(result).toEqual([
          'group_company_global',
          'group_academic',
          'group_curated_domestic',
        ]);
      }
    });

    it('should return original input when feature flag is false', () => {
      if (!FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertCategoryToGroupParams(['company', 'foreign']);
        expect(result).toEqual(['company', 'foreign']);
      }
    });

    it('should handle empty array', () => {
      const result = convertCategoryToGroupParams([]);
      expect(result).toEqual([]);
    });
  });

  describe('convertGroupToCategoryParams', () => {
    it('should convert group IDs to category IDs when feature flag is true', () => {
      if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(result).toEqual(['company', 'foreign']);
      }
    });

    it('should filter out unknown group IDs', () => {
      if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'unknown_group',
          'group_community',
        ]);
        expect(result).toEqual(['company', 'community']);
      }
    });

    it('should return original input when feature flag is false', () => {
      if (!FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(result).toEqual(['group_company_japan', 'group_company_global']);
      }
    });

    it('should handle empty array', () => {
      const result = convertGroupToCategoryParams([]);
      expect(result).toEqual([]);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve category IDs through round-trip conversion', () => {
      if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
        const original = ['company', 'community', 'academic'];
        const groupIds = convertCategoryToGroupParams(original);
        const roundTrip = convertGroupToCategoryParams(groupIds);

        // Round-trip may not preserve exact order or multi-mapping categories
        // but should preserve core categories
        expect(roundTrip).toContain('company');
        expect(roundTrip).toContain('community');
        expect(roundTrip).toContain('academic');
      }
    });
  });
});
