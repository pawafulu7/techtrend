/**
 * [Phase2A][Integration] Filter Compatibility Tests
 *
 * Integration tests for category-group mapping compatibility layer.
 * Tests Feature Flag=true (DB-backed) vs Feature Flag=false (Legacy) paths.
 *
 * Test scenarios:
 * - Category to Group ID conversion (Feature Flag=true)
 * - Fallback to legacy path (Feature Flag=false)
 * - Preset selection with DB-backed vs Legacy
 * - Group ID to Category ID reverse mapping
 * - Category icon compatibility
 * - Data sync between DB provider and legacy fixtures
 *
 * @see Plan: plan_20251116_103350_791_phase2a-day5-7-tests.md:38-54
 */

// Mock Prisma and Redis before imports
jest.mock('@/lib/prisma');
jest.mock('@/lib/cache/redis-cache');

import { prismaMock } from '../../__mocks__/prisma';
import {
  seedPrismaWithSourceFixtures,
  withFeatureFlag,
  mockSources,
  mockSourceGroups,
  cleanupPhase2ATests,
  validateFixtureConsistency,
} from '../../helpers/phase2a-test-fixtures';

describe('[Phase2A][Integration] Filter Compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    seedPrismaWithSourceFixtures(prismaMock);
  });

  afterEach(() => {
    cleanupPhase2ATests();
  });

  describe('Fixture Consistency', () => {
    it('should have consistent fixture data with SOURCE_CATEGORIES', () => {
      expect(() => validateFixtureConsistency()).not.toThrow();
    });
  });

  describe('Category to Group ID Conversion', () => {
    it('should convert category IDs to group IDs when feature flag is true', async () => {
      await withFeatureFlag(true, async () => {
        const { getGroupIdsByCategoryId } = await import(
          '@/lib/compatibility/category-group-mapping'
        );

        const companyGroupIds = getGroupIdsByCategoryId('company');
        expect(companyGroupIds).toEqual(['group_company_japan']);

        const foreignGroupIds = getGroupIdsByCategoryId('foreign');
        expect(foreignGroupIds).toEqual(['group_company_global']);

        const aiGroupIds = getGroupIdsByCategoryId('ai');
        expect(aiGroupIds).toEqual([
          'group_company_global',
          'group_academic',
          'group_curated_domestic',
        ]);
      });
    });

    it('should convert multiple category IDs to group IDs and remove duplicates', async () => {
      await withFeatureFlag(true, async () => {
        const { getGroupIdsForCategories } = await import(
          '@/lib/compatibility/category-group-mapping'
        );

        // ai and llm map to the same groups, so duplicates should be removed
        const groupIds = getGroupIdsForCategories(['ai', 'llm']);
        expect(groupIds).toEqual([
          'group_company_global',
          'group_academic',
          'group_curated_domestic',
        ]);
      });
    });
  });

  describe('Group ID to Category ID Reverse Mapping', () => {
    it('should convert group IDs to primary category IDs', async () => {
      await withFeatureFlag(true, async () => {
        const { getPrimaryCategoryByGroupId } = await import(
          '@/lib/compatibility/category-group-mapping'
        );

        expect(getPrimaryCategoryByGroupId('group_company_japan')).toBe('company');
        expect(getPrimaryCategoryByGroupId('group_company_global')).toBe('foreign');
        expect(getPrimaryCategoryByGroupId('group_community')).toBe('domestic');
        expect(getPrimaryCategoryByGroupId('group_academic')).toBe('domestic');
        expect(getPrimaryCategoryByGroupId('group_curated_domestic')).toBe('domestic');
        expect(getPrimaryCategoryByGroupId('group_presentation')).toBe('presentation');
      });
    });

    it('should return undefined for unknown group IDs', async () => {
      await withFeatureFlag(true, async () => {
        const { getPrimaryCategoryByGroupId } = await import(
          '@/lib/compatibility/category-group-mapping'
        );

        expect(getPrimaryCategoryByGroupId('unknown_group')).toBeUndefined();
      });
    });

    it('should convert multiple group IDs to category IDs and filter unknown groups', async () => {
      await withFeatureFlag(true, async () => {
        const { getPrimaryCategoriesForGroups } = await import(
          '@/lib/compatibility/category-group-mapping'
        );

        const categoryIds = getPrimaryCategoriesForGroups([
          'group_company_japan',
          'unknown_group',
          'group_community',
        ]);
        expect(categoryIds).toEqual(['company', 'domestic']);
      });
    });
  });

  describe('URL/Cookie Conversion Helpers', () => {
    it('should convert category IDs to group IDs when feature flag is true', async () => {
      await withFeatureFlag(true, async () => {
        const { convertCategoryToGroupParams } = await import(
          '@/lib/compatibility/url-params-compat'
        );

        const groupIds = convertCategoryToGroupParams(['company', 'foreign']);
        expect(groupIds).toEqual(['group_company_japan', 'group_company_global']);
      });
    });

    it('should return original category IDs when feature flag is false', async () => {
      await withFeatureFlag(false, async () => {
        const { convertCategoryToGroupParams } = await import(
          '@/lib/compatibility/url-params-compat'
        );

        const result = convertCategoryToGroupParams(['company', 'foreign']);
        expect(result).toEqual(['company', 'foreign']);
      });
    });

    it('should convert group IDs to category IDs when feature flag is true', async () => {
      await withFeatureFlag(true, async () => {
        const { convertGroupToCategoryParams } = await import(
          '@/lib/compatibility/url-params-compat'
        );

        const categoryIds = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(categoryIds).toEqual(['company', 'foreign']);
      });
    });

    it('should return original group IDs when feature flag is false', async () => {
      await withFeatureFlag(false, async () => {
        const { convertGroupToCategoryParams } = await import(
          '@/lib/compatibility/url-params-compat'
        );

        const result = convertGroupToCategoryParams([
          'group_company_japan',
          'group_company_global',
        ]);
        expect(result).toEqual(['group_company_japan', 'group_company_global']);
      });
    });

    it('should perform round-trip conversion correctly', async () => {
      await withFeatureFlag(true, async () => {
        const { convertCategoryToGroupParams, convertGroupToCategoryParams } =
          await import('@/lib/compatibility/url-params-compat');

        const categoryIds = ['company', 'foreign'];
        const groupIds = convertCategoryToGroupParams(categoryIds);
        const backToCategoryIds = convertGroupToCategoryParams(groupIds);

        expect(backToCategoryIds.sort()).toEqual(categoryIds.sort());
      });
    });
  });

  describe('Preset Selection Integration', () => {
    it('should get source IDs for company preset using DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        jest.isolateModules(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { createInMemoryCompanyProvider } = await import(
            '../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('company', groupedSources);

          // company preset -> group_company_japan
          const expectedSourceIds = mockSources
            .filter((s) => s.groupId === 'group_company_japan')
            .map((s) => s.id);

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    it('should get source IDs for foreign preset using DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        jest.isolateModules(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { createInMemoryCompanyProvider } = await import(
            '../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('foreign', groupedSources);

          // foreign preset -> group_company_global
          const expectedSourceIds = mockSources
            .filter((s) => s.groupId === 'group_company_global')
            .map((s) => s.id);

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    it('should get source IDs for ai-ml preset using DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        jest.isolateModules(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { createInMemoryCompanyProvider } = await import(
            '../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('ai-ml', groupedSources);

          // ai-ml preset -> group_company_global + group_academic + group_curated_domestic
          const expectedSourceIds = mockSources
            .filter(
              (s) =>
                s.groupId === 'group_company_global' ||
                s.groupId === 'group_academic' ||
                s.groupId === 'group_curated_domestic'
            )
            .map((s) => s.id);

          // Deduplicate
          const uniqueExpectedIds = Array.from(new Set(expectedSourceIds));
          expect(sourceIds.sort()).toEqual(uniqueExpectedIds.sort());
        });
      });
    });

    it('should fallback to legacy path when groupedSources is not provided', async () => {
      await withFeatureFlag(true, async () => {
        jest.isolateModules(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          // groupedSources not provided -> fallback to SOURCE_CATEGORIES
          const sourceIds = getSourceIdsForPreset('company');

          // Expect fallback to legacy path (SOURCE_CATEGORIES)
          expect(Array.isArray(sourceIds)).toBe(true);
        });
      });
    });

    it('should use legacy path when feature flag is false', async () => {
      await withFeatureFlag(false, async () => {
        jest.isolateModules(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { createInMemoryCompanyProvider } = await import(
            '../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('company', groupedSources);

          // Feature Flag=false -> legacy path (SOURCE_CATEGORIES)
          expect(Array.isArray(sourceIds)).toBe(true);
        });
      });
    });
  });

  describe('Data Sync Between DB Provider and Legacy Fixtures', () => {
    it('should have consistent source IDs between DB provider and legacy paths', async () => {
      // DB provider path (Feature Flag=true)
      const dbSourceIds = await withFeatureFlag(true, async () => {
        return jest.isolateModules(async () => {
          const { createInMemoryCompanyProvider } = await import(
            '../../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createInMemoryCompanyProvider();
          return groupedSources.flatMap((gs) => gs.sources.map((s) => s.id));
        });
      });

      // Legacy path (Feature Flag=false)
      const legacySourceIds = await withFeatureFlag(false, async () => {
        return jest.isolateModules(async () => {
          const { SOURCE_CATEGORIES } = await import(
            '@/lib/constants/source-categories'
          );

          const allSourceIds = Object.values(SOURCE_CATEGORIES).flatMap(
            (category) => category.sourceIds
          );

          return Array.from(new Set(allSourceIds));
        });
      });

      // Both paths should return the same source IDs (subset check)
      // Note: mockSources is a subset of SOURCE_CATEGORIES
      expect(dbSourceIds.length).toBeGreaterThan(0);
      expect(legacySourceIds.length).toBeGreaterThan(0);

      // All DB source IDs should exist in legacy source IDs
      dbSourceIds.forEach((id: string) => {
        expect(legacySourceIds).toContain(id);
      });
    });
  });

  describe('Provider Factory Integration', () => {
    it('should return DatabaseCompanySourceProvider when feature flag is true', async () => {
      await withFeatureFlag(true, async () => {
        jest.isolateModules(async () => {
          const { createCompanySourceProvider } = await import(
            '@/lib/providers/company-source/factory'
          );
          const { DatabaseCompanySourceProvider } = await import(
            '@/lib/providers/company-source/database-provider'
          );

          const provider = createCompanySourceProvider();
          expect(provider).toBeInstanceOf(DatabaseCompanySourceProvider);
        });
      });
    });

    it('should return StaticCompanySourceProvider when feature flag is false', async () => {
      await withFeatureFlag(false, async () => {
        jest.isolateModules(async () => {
          const { createCompanySourceProvider } = await import(
            '@/lib/providers/company-source/factory'
          );
          const { StaticCompanySourceProvider } = await import(
            '@/lib/providers/company-source/static-provider'
          );

          const provider = createCompanySourceProvider();
          expect(provider).toBeInstanceOf(StaticCompanySourceProvider);
        });
      });
    });
  });
});
