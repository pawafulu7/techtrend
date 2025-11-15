import {
  SOURCE_FILTER_PRESETS,
  getSourceIdsForPreset,
  getAllPresets,
  getPresetById
} from '@/lib/constants/source-presets';
import { getSourceIdsByCategory } from '@/lib/constants/source-categories';
import type { GroupedSources } from '@/lib/types/source-grouping';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

describe('source-presets', () => {
  describe('SOURCE_FILTER_PRESETS', () => {
    it('should have 4 presets defined', () => {
      const presets = Object.keys(SOURCE_FILTER_PRESETS);
      expect(presets).toHaveLength(4);
      expect(presets).toContain('company');
      expect(presets).toContain('ai-ml');
      expect(presets).toContain('foreign');
      expect(presets).toContain('domestic-all');
    });

    it('should have valid structure for each preset', () => {
      Object.values(SOURCE_FILTER_PRESETS).forEach(preset => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
        expect(preset).toHaveProperty('icon');
        expect(preset).toHaveProperty('categories');
        expect(Array.isArray(preset.categories)).toBe(true);
        expect(preset.categories.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getSourceIdsForPreset', () => {
    it('should return source IDs for company preset', () => {
      const sourceIds = getSourceIdsForPreset('company');
      const companySourceIds = getSourceIdsByCategory('company');

      expect(sourceIds).toEqual(companySourceIds);
      expect(sourceIds.length).toBeGreaterThan(0);
    });

    it('should return source IDs for ai-ml preset', () => {
      const sourceIds = getSourceIdsForPreset('ai-ml');
      const aiSourceIds = getSourceIdsByCategory('ai');
      const llmSourceIds = getSourceIdsByCategory('llm');

      // ai-ml should include both ai and llm sources
      expect(sourceIds.length).toBeGreaterThan(0);

      // Check that it includes some sources from both categories
      const hasAiSources = aiSourceIds.some(id => sourceIds.includes(id));
      const hasLlmSources = llmSourceIds.some(id => sourceIds.includes(id));

      expect(hasAiSources).toBe(true);
      expect(hasLlmSources).toBe(true);
    });

    it('should remove duplicates for ai-ml preset', () => {
      const sourceIds = getSourceIdsForPreset('ai-ml');

      // Check for uniqueness
      const uniqueSourceIds = Array.from(new Set(sourceIds));
      expect(sourceIds).toEqual(uniqueSourceIds);
      expect(sourceIds.length).toBe(uniqueSourceIds.length);
    });

    it('should return source IDs for foreign preset', () => {
      const sourceIds = getSourceIdsForPreset('foreign');
      const foreignSourceIds = getSourceIdsByCategory('foreign');

      expect(sourceIds).toEqual(foreignSourceIds);
      expect(sourceIds.length).toBeGreaterThan(0);
    });

    it('should return source IDs for domestic-all preset', () => {
      const sourceIds = getSourceIdsForPreset('domestic-all');
      const domesticSourceIds = getSourceIdsByCategory('domestic');
      const companySourceIds = getSourceIdsByCategory('company');

      // domestic-all should include both domestic and company sources
      expect(sourceIds.length).toBeGreaterThan(0);

      // Check that it includes sources from both categories
      const hasDomesticSources = domesticSourceIds.some(id => sourceIds.includes(id));
      const hasCompanySources = companySourceIds.some(id => sourceIds.includes(id));

      expect(hasDomesticSources).toBe(true);
      expect(hasCompanySources).toBe(true);
    });

    it('should return empty array for invalid preset ID', () => {
      const sourceIds = getSourceIdsForPreset('invalid-preset');
      expect(sourceIds).toEqual([]);
    });

    it('should return empty array for empty string preset ID', () => {
      const sourceIds = getSourceIdsForPreset('');
      expect(sourceIds).toEqual([]);
    });

    describe('with groupedSources (Phase 2-A)', () => {
      const mockGroupedSources: GroupedSources[] = [
        {
          group: {
            id: 'group_company_japan',
            name: 'Japanese Companies',
            type: 'company_blog',
            ordering: 1,
          },
          sources: [
            { id: 'source_company_1', name: 'Company 1' },
            { id: 'source_company_2', name: 'Company 2' },
          ],
        },
        {
          group: {
            id: 'group_company_global',
            name: 'Global Companies',
            type: 'company_blog',
            ordering: 2,
          },
          sources: [
            { id: 'source_global_1', name: 'Global 1' },
            { id: 'source_global_2', name: 'Global 2' },
          ],
        },
        {
          group: {
            id: 'group_academic',
            name: 'Academic',
            type: 'academic',
            ordering: 3,
          },
          sources: [
            { id: 'source_academic_1', name: 'Academic 1' },
          ],
        },
        {
          group: {
            id: 'group_curated_domestic',
            name: 'Curated Domestic',
            type: 'curated',
            ordering: 4,
          },
          sources: [
            { id: 'source_curated_1', name: 'Curated 1' },
          ],
        },
      ];

      it('should return source IDs for company preset using groupedSources', () => {
        if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
          const sourceIds = getSourceIdsForPreset('company', mockGroupedSources);
          // company category maps to group_company_japan
          expect(sourceIds).toEqual(['source_company_1', 'source_company_2']);
        }
      });

      it('should return source IDs for foreign preset using groupedSources', () => {
        if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
          const sourceIds = getSourceIdsForPreset('foreign', mockGroupedSources);
          // foreign category maps to group_company_global
          expect(sourceIds).toContain('source_global_1');
          expect(sourceIds).toContain('source_global_2');
        }
      });

      it('should return source IDs for ai-ml preset using groupedSources', () => {
        if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
          const sourceIds = getSourceIdsForPreset('ai-ml', mockGroupedSources);
          // ai/llm categories map to group_company_global, group_academic, group_curated_domestic
          expect(sourceIds).toContain('source_global_1');
          expect(sourceIds).toContain('source_global_2');
          expect(sourceIds).toContain('source_academic_1');
          expect(sourceIds).toContain('source_curated_1');
        }
      });

      it('should remove duplicates when multiple categories map to same groups', () => {
        if (FEATURE_FLAGS.USE_DATABASE_PROVIDER) {
          const sourceIds = getSourceIdsForPreset('ai-ml', mockGroupedSources);
          // ai and llm map to the same groups, so duplicates should be removed
          const uniqueIds = Array.from(new Set(sourceIds));
          expect(sourceIds).toEqual(uniqueIds);
        }
      });

      it('should fallback to legacy path when groupedSources is not provided', () => {
        const sourceIds = getSourceIdsForPreset('company');
        // Should use static SOURCE_CATEGORIES
        expect(sourceIds.length).toBeGreaterThan(0);
      });

      it('should fallback to legacy path when groupedSources is empty', () => {
        const sourceIds = getSourceIdsForPreset('company', []);
        // Should use static SOURCE_CATEGORIES
        expect(sourceIds.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getAllPresets', () => {
    it('should return all presets', () => {
      const presets = getAllPresets();
      expect(presets).toHaveLength(4);
      expect(presets.map(p => p.id)).toContain('company');
      expect(presets.map(p => p.id)).toContain('ai-ml');
      expect(presets.map(p => p.id)).toContain('foreign');
      expect(presets.map(p => p.id)).toContain('domestic-all');
    });
  });

  describe('getPresetById', () => {
    it('should return preset for valid ID', () => {
      const preset = getPresetById('company');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('company');
      expect(preset?.name).toBe('国内企業');
    });

    it('should return undefined for invalid ID', () => {
      const preset = getPresetById('invalid-preset');
      expect(preset).toBeUndefined();
    });

    it('should return undefined for empty string ID', () => {
      const preset = getPresetById('');
      expect(preset).toBeUndefined();
    });
  });
});
