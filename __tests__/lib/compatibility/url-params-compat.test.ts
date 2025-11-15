import {
  convertCategoryToGroupParams,
  convertGroupToCategoryParams,
} from '@/lib/compatibility/url-params-compat';

// Mock FEATURE_FLAGS module
jest.mock('@/lib/config/feature-flags', () => ({
  FEATURE_FLAGS: {
    USE_DATABASE_PROVIDER: false,
  },
}));

describe('url-params-compat', () => {
  describe('convertCategoryToGroupParams', () => {
    describe('with USE_DATABASE_PROVIDER=true', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('@/lib/config/feature-flags', () => ({
          FEATURE_FLAGS: {
            USE_DATABASE_PROVIDER: true,
          },
        }));
      });

      afterEach(() => {
        jest.resetModules();
      });

      it('should convert category IDs to group IDs when feature flag is true', async () => {
        const { convertCategoryToGroupParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertCategoryToGroupParams(['company', 'foreign']);
        expect(result).toEqual(['group_company_japan', 'group_company_global']);
      });

      it('should remove duplicates when converting', async () => {
        const { convertCategoryToGroupParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertCategoryToGroupParams(['ai', 'llm']);
        // ai and llm map to the same groups
        expect(result).toEqual([
          'group_company_global',
          'group_academic',
          'group_curated_domestic',
        ]);
      });

      it('should handle empty array', async () => {
        const { convertCategoryToGroupParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertCategoryToGroupParams([]);
        expect(result).toEqual([]);
      });
    });

    describe('with USE_DATABASE_PROVIDER=false', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('@/lib/config/feature-flags', () => ({
          FEATURE_FLAGS: {
            USE_DATABASE_PROVIDER: false,
          },
        }));
      });

      afterEach(() => {
        jest.resetModules();
      });

      it('should return original input when feature flag is false', async () => {
        const { convertCategoryToGroupParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertCategoryToGroupParams(['company', 'foreign']);
        expect(result).toEqual(['company', 'foreign']);
      });

      it('should handle empty array', async () => {
        const { convertCategoryToGroupParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertCategoryToGroupParams([]);
        expect(result).toEqual([]);
      });
    });
  });

  describe('convertGroupToCategoryParams', () => {
    describe('with USE_DATABASE_PROVIDER=true', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('@/lib/config/feature-flags', () => ({
          FEATURE_FLAGS: {
            USE_DATABASE_PROVIDER: true,
          },
        }));
      });

      afterEach(() => {
        jest.resetModules();
      });

      it('should convert group IDs to category IDs when feature flag is true', async () => {
        const { convertGroupToCategoryParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(result).toEqual(['company', 'foreign']);
      });

      it('should filter out unknown group IDs', async () => {
        const { convertGroupToCategoryParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'unknown_group',
          'group_community',
        ]);
        // group_community maps to 'domestic' (not 'community')
        expect(result).toEqual(['company', 'domestic']);
      });

      it('should handle empty array', async () => {
        const { convertGroupToCategoryParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertGroupToCategoryParams([]);
        expect(result).toEqual([]);
      });
    });

    describe('with USE_DATABASE_PROVIDER=false', () => {
      beforeEach(() => {
        jest.resetModules();
        jest.doMock('@/lib/config/feature-flags', () => ({
          FEATURE_FLAGS: {
            USE_DATABASE_PROVIDER: false,
          },
        }));
      });

      afterEach(() => {
        jest.resetModules();
      });

      it('should return original input when feature flag is false', async () => {
        const { convertGroupToCategoryParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(result).toEqual(['group_company_japan', 'group_company_global']);
      });

      it('should handle empty array', async () => {
        const { convertGroupToCategoryParams } = await import('@/lib/compatibility/url-params-compat');
        const result = convertGroupToCategoryParams([]);
        expect(result).toEqual([]);
      });
    });
  });

  describe('round-trip conversion', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('@/lib/config/feature-flags', () => ({
        FEATURE_FLAGS: {
          USE_DATABASE_PROVIDER: true,
        },
      }));
    });

    afterEach(() => {
      jest.resetModules();
    });

    it('should preserve category IDs through round-trip conversion', async () => {
      const {
        convertCategoryToGroupParams,
        convertGroupToCategoryParams,
      } = await import('@/lib/compatibility/url-params-compat');

      const original = ['company', 'domestic'];
      const groupIds = convertCategoryToGroupParams(original);
      const roundTrip = convertGroupToCategoryParams(groupIds);

      // Round-trip should preserve core categories
      expect(roundTrip).toContain('company');
      expect(roundTrip).toContain('domestic');
    });
  });
});
