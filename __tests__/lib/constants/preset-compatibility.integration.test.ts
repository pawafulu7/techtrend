/**
 * [Phase2A][Integration] Preset Compatibility Tests
 *
 * Integration tests for preset functionality with DB-backed vs Legacy paths.
 * Tests Feature Flag=true (groupedSources) vs Feature Flag=false (SOURCE_CATEGORIES).
 *
 * Test scenarios:
 * - Each preset (company, foreign, domestic, presentation, ai-ml) source ID retrieval
 * - DB-backed path and Legacy path tested separately (not strict consistency)
 * - Duplicate removal
 * - groupedSources argument fallback
 *
 * Note: Full consistency tests (DB vs Legacy) are skipped due to sample data limitation.
 * Complete data verification planned for Day 6-7 or production rollout.
 *
 * @see Plan: plan_20251116_103350_791_phase2a-day5-7-tests.md:56-66
 */

// Mock Prisma and Redis before imports
jest.mock('@/lib/prisma');
jest.mock('@/lib/cache/redis-cache');

import { prismaMock } from '../../__mocks__/prisma';
import {
  seedPrismaWithSourceFixtures,
  withFeatureFlag,
  makeLegacyPresetFixture,
  createInMemoryCompanyProvider,
  cleanupPhase2ATests,
  mockSources,
} from '../../helpers/phase2a-test-fixtures';

describe('[Phase2A][Integration] Preset Compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    seedPrismaWithSourceFixtures(prismaMock);
  });

  afterEach(() => {
    cleanupPhase2ATests();
  });

  describe('Company Preset', () => {
    it('should get correct source IDs for company preset with DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { createInMemoryCompanyProvider: createProvider } = await import(
            '../../helpers/phase2a-test-fixtures'
          );

          const groupedSources = createProvider();
          const sourceIds = getSourceIdsForPreset('company', groupedSources);

          // company preset -> group_company_japan
          const expectedSourceIds = mockSources
            .filter((s) => s.groupId === 'group_company_japan')
            .map((s) => s.id);

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    it('should get correct source IDs for company preset with legacy path', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const { makeLegacyPresetFixture: makeLegacy } = await import(
            '../../helpers/phase2a-test-fixtures'
          );

          const sourceIds = getSourceIdsForPreset('company');
          const expectedSourceIds = makeLegacy('company');

          // Both should have the same IDs (SOURCE_CATEGORIES)
          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    // Note: Skipped due to mockSources being sample data (not complete SOURCE_CATEGORIES)
    // Full data consistency should be verified with production data
    it.skip('should have consistent source IDs between DB-backed and legacy paths for company preset', async () => {
      // DB-backed path
      const dbSourceIds = await withFeatureFlag(true, async () => {
        let ids: string[] | undefined;

        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();
          ids = getSourceIdsForPreset('company', groupedSources);
        });

        if (!ids) {
          throw new Error('Unable to resolve DB source IDs inside isolateModules');
        }
        return ids;
      });

      // Legacy path
      const legacySourceIds = await withFeatureFlag(false, async () => {
        let ids: string[] | undefined;

        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          ids = getSourceIdsForPreset('company');
        });

        if (!ids) {
          throw new Error('Unable to resolve legacy source IDs inside isolateModules');
        }
        return ids;
      });

      // DB source IDs should be a subset of legacy source IDs
      expect(dbSourceIds.length).toBeGreaterThan(0);
      dbSourceIds.forEach((id: string) => {
        expect(legacySourceIds).toContain(id);
      });
    });
  });

  describe('Foreign Preset', () => {
    it('should get correct source IDs for foreign preset with DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
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

    it('should get correct source IDs for foreign preset with legacy path', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          const sourceIds = getSourceIdsForPreset('foreign');
          const expectedSourceIds = makeLegacyPresetFixture('foreign');

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });
  });

  describe('Domestic Preset', () => {
    it('should get correct source IDs for domestic preset with DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('domestic', groupedSources);

          // domestic preset -> group_community + group_academic + group_curated_domestic
          const expectedSourceIds = mockSources
            .filter(
              (s) =>
                s.groupId === 'group_community' ||
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

    it('should get correct source IDs for domestic preset with legacy path', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          const sourceIds = getSourceIdsForPreset('domestic');
          const expectedSourceIds = makeLegacyPresetFixture('domestic');

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });
  });

  describe('Presentation Preset', () => {
    it('should get correct source IDs for presentation preset with DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('presentation', groupedSources);

          // presentation preset -> group_presentation
          const expectedSourceIds = mockSources
            .filter((s) => s.groupId === 'group_presentation')
            .map((s) => s.id);

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    it('should get correct source IDs for presentation preset with legacy path', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          const sourceIds = getSourceIdsForPreset('presentation');
          const expectedSourceIds = makeLegacyPresetFixture('presentation');

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });
  });

  describe('AI-ML Preset', () => {
    it('should get correct source IDs for ai-ml preset with DB-backed path', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
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

    it('should get correct source IDs for ai-ml preset with legacy path', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          const sourceIds = getSourceIdsForPreset('ai-ml');
          const expectedSourceIds = makeLegacyPresetFixture('ai-ml');

          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });

    it('should remove duplicates when multiple categories map to same groups', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();
          const sourceIds = getSourceIdsForPreset('ai-ml', groupedSources);

          // Check no duplicates
          const uniqueSourceIds = Array.from(new Set(sourceIds));
          expect(sourceIds.length).toBe(uniqueSourceIds.length);
        });
      });
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to legacy path when groupedSources is not provided (Feature Flag=true)', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          // groupedSources not provided -> fallback to SOURCE_CATEGORIES
          const sourceIds = getSourceIdsForPreset('company');

          // Expect fallback to legacy path
          expect(Array.isArray(sourceIds)).toBe(true);
          expect(sourceIds.length).toBeGreaterThan(0);
        });
      });
    });

    it('should fallback to legacy path when groupedSources is empty array (Feature Flag=true)', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );

          // groupedSources is empty -> fallback to SOURCE_CATEGORIES
          const sourceIds = getSourceIdsForPreset('company', []);

          // Expect fallback to legacy path
          expect(Array.isArray(sourceIds)).toBe(true);
          expect(sourceIds.length).toBeGreaterThan(0);
        });
      });
    });

    it('should always use legacy path when Feature Flag=false regardless of groupedSources', async () => {
      await withFeatureFlag(false, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();

          // Feature Flag=false -> legacy path (ignores groupedSources)
          const sourceIds = getSourceIdsForPreset('company', groupedSources);

          // Expect legacy path (SOURCE_CATEGORIES)
          const expectedSourceIds = makeLegacyPresetFixture('company');
          expect(sourceIds.sort()).toEqual(expectedSourceIds.sort());
        });
      });
    });
  });

  describe('Duplicate Removal', () => {
    it('should remove duplicates when multiple categories map to overlapping groups', async () => {
      await withFeatureFlag(true, async () => {
        await jest.isolateModulesAsync(async () => {
          const { getSourceIdsForPreset } = await import(
            '@/lib/constants/source-presets'
          );
          const groupedSources = createInMemoryCompanyProvider();

          // ai-ml preset uses 'ai' and 'llm' categories, which may map to overlapping groups
          const sourceIds = getSourceIdsForPreset('ai-ml', groupedSources);

          // Check all IDs are unique
          const uniqueIds = Array.from(new Set(sourceIds));
          expect(sourceIds.length).toBe(uniqueIds.length);
        });
      });
    });
  });
});
