import { SourceCategoryId, getSourceIdsByCategory } from './source-categories';

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
  'domestic-all': {
    id: 'domestic-all',
    name: '国内全般',
    description: '日本の技術情報全般（情報サイト+企業ブログ）',
    icon: 'Home',
    categories: ['domestic', 'company']
  }
};

export function getSourceIdsForPreset(presetId: string): string[] {
  const preset = SOURCE_FILTER_PRESETS[presetId];
  if (!preset) return [];

  // カテゴリIDからソースIDを取得
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
