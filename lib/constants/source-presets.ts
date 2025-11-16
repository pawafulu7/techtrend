import { SourceCategoryId, getSourceIdsByCategory } from './source-categories';
import type { GroupedSources } from '@/lib/types/source-grouping';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';
import { getGroupIdsForCategories } from '@/lib/compatibility/category-group-mapping';

export interface SourceFilterPreset {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  categories: SourceCategoryId[];
}

export const SOURCE_FILTER_PRESETS: Record<string, SourceFilterPreset> = {
  company: {
    id: 'company',
    name: '国内企業',
    description: '日本企業の技術ブログのみ',
    icon: 'Building2',
    categories: ['company']
  },
  'ai-ml': {
    id: 'ai-ml',
    name: 'AI/ML',
    description: 'AI・機械学習関連の情報のみ',
    icon: 'Brain',
    categories: ['ai', 'llm']
  },
  foreign: {
    id: 'foreign',
    name: '海外',
    description: '海外の技術情報サイトのみ',
    icon: 'Globe',
    categories: ['foreign']
  },
  domestic: {
    id: 'domestic',
    name: '国内コミュニティ',
    description: '国内のコミュニティ/アカデミック系ソースのみ',
    icon: 'Users',
    categories: ['domestic']
  },
  presentation: {
    id: 'presentation',
    name: 'プレゼンテーション',
    description: 'スライド・プレゼン資料のみ',
    icon: 'Presentation',
    categories: ['presentation']
  },
  'domestic-all': {
    id: 'domestic-all',
    name: '国内全般',
    description: '日本の技術情報全般（情報サイト+企業ブログ）',
    icon: 'Home',
    categories: ['domestic', 'company']
  }
};

/**
 * Get source IDs for a preset
 *
 * @param presetId - Preset ID
 * @param groupedSources - Optional grouped sources (for DB-backed path)
 * @returns Array of source IDs
 */
export function getSourceIdsForPreset(
  presetId: string,
  groupedSources?: GroupedSources[]
): string[] {
  const preset = SOURCE_FILTER_PRESETS[presetId];
  if (!preset) return [];

  // DB-backed path: Use groupedSources (only if non-empty)
  if (
    FEATURE_FLAGS.USE_DATABASE_PROVIDER &&
    groupedSources &&
    groupedSources.length > 0
  ) {
    const targetGroupIds = getGroupIdsForCategories(preset.categories);
    const sourceIds = groupedSources
      .filter(gs => targetGroupIds.includes(gs.group.id))
      .flatMap(gs => gs.sources.map(s => s.id));

    // 重複除去
    return Array.from(new Set(sourceIds));
  }

  // Legacy path: Use static SOURCE_CATEGORIES
  const sourceIds = preset.categories.flatMap(categoryId =>
    getSourceIdsByCategory(categoryId)
  );

  // 重複除去（ai/llm に重複ソースがあるため）
  return Array.from(new Set(sourceIds));
}

export function getAllPresets(): SourceFilterPreset[] {
  return Object.values(SOURCE_FILTER_PRESETS);
}

export function getPresetById(presetId: string): SourceFilterPreset | undefined {
  return SOURCE_FILTER_PRESETS[presetId];
}
