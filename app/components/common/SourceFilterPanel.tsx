'use client';

import { Button } from '@/components/ui-v2/button-v2';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Globe,
  Building2,
  FileText,
  Presentation,
  Brain,
  Cpu,
  Home,
} from 'lucide-react';
import type { SourceCategory } from '@/lib/constants/source-categories';
import { CompanyFilter } from '@/app/components/source-filters/company-filter';
import { CustomPresetDropdown } from '@/app/components/source-filters/custom-preset-dropdown';
import { getPrimaryCategoryByGroupId } from '@/lib/compatibility/category-group-mapping';
import type { CompanySource } from '@/lib/providers/company-source';

// カテゴリごとのアイコンマッピング（Legacy categories only）
const categoryIcons: Record<string, React.ReactNode> = {
  foreign: <Globe className="h-3 w-3" />,
  domestic: <FileText className="h-3 w-3" />,
  company: <Building2 className="h-3 w-3" />,
  presentation: <Presentation className="h-3 w-3" />,
  ai: <Brain className="h-3 w-3" />,
  llm: <Cpu className="h-3 w-3" />,
};

/**
 * Get category icon for a category or group ID
 *
 * Phase 2-A: Supports both legacy category IDs and new group IDs via reverse mapping
 */
function getCategoryIcon(categoryOrGroupId: string): React.ReactNode {
  // Try direct lookup first (legacy categories)
  if (categoryIcons[categoryOrGroupId]) {
    return categoryIcons[categoryOrGroupId];
  }

  // Fallback: Try reverse mapping (group -> primary category)
  const primaryCategory = getPrimaryCategoryByGroupId(categoryOrGroupId);
  if (primaryCategory && categoryIcons[primaryCategory]) {
    return categoryIcons[primaryCategory];
  }

  // Default icon
  return <FileText className="h-3 w-3" />;
}

interface SourceFilterPanelProps {
  sources: Array<{ id: string; name: string }>;
  initialIsAuthenticated: boolean;
  selectedSources: string[];
  expandedCategories: Set<string>;
  setExpandedCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  groupedSourcesMap: Map<SourceCategory, Array<{ id: string; name: string }>>;
  companySources: Array<{ id: string; name: string }>;
  companySourcesTyped: CompanySource[];
  companyFilter: {
    visibleSidebarSources: CompanySource[];
    searchValue: string;
    setSearchValue: (value: string) => void;
  };
  handleSourceToggle: (sourceId: string) => void;
  handleSelectAll: () => void;
  handleDeselectAll: () => void;
  applyPreset: (presetId: string) => void;
  handleCategorySelectAll: (category: SourceCategory) => void;
  handleCategoryDeselectAll: (category: SourceCategory) => void;
  handleCompanyBatchSelect: (companyIds: string[]) => void;
  toggleCategory: (categoryId: string) => void;
  applySourceFilter: (sourceIds: string[]) => void;
}

export function SourceFilterPanel({
  sources,
  initialIsAuthenticated,
  selectedSources,
  expandedCategories,
  setExpandedCategories,
  groupedSourcesMap,
  companySources,
  companySourcesTyped,
  companyFilter,
  handleSourceToggle,
  handleSelectAll,
  handleDeselectAll,
  applyPreset,
  handleCategorySelectAll,
  handleCategoryDeselectAll,
  handleCompanyBatchSelect,
  toggleCategory,
  applySourceFilter,
}: SourceFilterPanelProps) {
  return (
    <div
      className="rounded-lg border border-white/20 bg-[var(--tt-color-surface)]/80 p-3 shadow-sm backdrop-blur-sm"
      data-testid="source-filter"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">ソース</h3>
        <span
          className="text-xs text-[var(--tt-color-text-muted)]"
          data-testid="source-count"
        >
          {selectedSources.length}/{sources.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="mb-2 flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="h-7 min-w-0 flex-1 justify-start overflow-hidden text-xs"
            data-testid="select-all-button"
            type="button"
          >
            <CheckSquare className="me-1 h-3 w-3 flex-shrink-0" />
            <span className="truncate">全て選択</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
            className="h-7 min-w-0 flex-1 justify-start overflow-hidden text-xs"
            data-testid="deselect-all-button"
            type="button"
          >
            <Square className="me-1 h-3 w-3 flex-shrink-0" />
            <span className="truncate">全て解除</span>
          </Button>
        </div>

        {/* Preset Buttons */}
        <div className="mb-2 flex flex-wrap gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('company')}
            className="h-7 border-[var(--tt-color-info-border)] text-xs transition-all hover:border-[var(--tt-color-info-border)] hover:bg-[var(--tt-color-info-bg)]"
            data-testid="preset-company"
            type="button"
            title="日本企業の技術ブログのみ"
          >
            <Building2 className="me-1 h-3 w-3" />
            国内企業
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('ai-ml')}
            className="h-7 border-[var(--tt-color-border)] text-xs transition-all hover:border-[var(--tt-color-border)] hover:bg-[var(--tt-color-surface-hover)]"
            data-testid="preset-ai-ml"
            type="button"
            title="AI・機械学習関連の情報のみ"
          >
            <Brain className="me-1 h-3 w-3" />
            AI/ML
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('foreign')}
            className="h-7 border-[var(--tt-color-positive-border)] text-xs transition-all hover:border-[var(--tt-color-positive-border)] hover:bg-[var(--tt-color-positive-bg)]"
            data-testid="preset-foreign"
            type="button"
            title="海外の技術情報サイトのみ"
          >
            <Globe className="me-1 h-3 w-3" />
            海外
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('domestic-all')}
            className="h-7 border-[var(--tt-color-warning-border)] text-xs transition-all hover:border-[var(--tt-color-warning-border)] hover:bg-[var(--tt-color-warning-bg)]"
            data-testid="preset-domestic-all"
            type="button"
            title="日本の技術情報全般（情報サイト+企業ブログ）"
          >
            <Home className="me-1 h-3 w-3" />
            国内全般
          </Button>

          {/* Custom Preset Dropdown */}
          <CustomPresetDropdown
            selectedSources={selectedSources}
            onApplyPreset={(sourceIds) => applySourceFilter(sourceIds)}
            allSources={sources}
            initialIsAuthenticated={initialIsAuthenticated}
          />
        </div>

        {/* Categories */}
        <div className="space-y-2">
          {/* Company blog filter (special UI) */}
          {companySources.length > 0 && (
            <CompanyFilter
              sources={companySourcesTyped}
              visibleSources={companyFilter.visibleSidebarSources}
              selectedSourceIds={selectedSources}
              searchValue={companyFilter.searchValue}
              onSearchChange={companyFilter.setSearchValue}
              onSourceToggle={handleSourceToggle}
              onBatchSelect={handleCompanyBatchSelect}
              isExpanded={expandedCategories.has('company')}
              onExpandedChange={(open) => {
                setExpandedCategories((prev) => {
                  const next = new Set(prev);
                  if (open) {
                    next.add('company');
                  } else {
                    next.delete('company');
                  }
                  return next;
                });
              }}
            />
          )}

          {/* Other categories (existing rendering) */}
          {Array.from(groupedSourcesMap.entries()).map(
            ([category, categorySources]) => {
              // Skip company category (already rendered above)
              if (category.id === 'company') {
                return null;
              }

              const isExpanded = expandedCategories.has(category.id);
              const categorySelectedCount = categorySources.filter((s) =>
                selectedSources.includes(s.id)
              ).length;

              return (
                <div
                  key={category.id}
                  className="rounded-md border"
                  data-testid={`category-${category.id}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => toggleCategory(category.id)}
                    type="button"
                    data-testid={`category-${category.id}-header`}
                  >
                    <div className="flex items-center justify-between p-2 hover:bg-[var(--tt-color-surface-hover)]">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        {getCategoryIcon(category.id)}
                        <span className="text-xs font-medium">
                          {category.name}
                        </span>
                        <span
                          className="text-xs text-[var(--tt-color-text-muted)]"
                          data-testid={`category-${category.id}-count`}
                        >
                          ({categorySelectedCount}/{categorySources.length})
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      className="px-2 pb-2"
                      data-testid={`category-${category.id}-content`}
                    >
                      {/* Category Actions */}
                      <div className="mb-1 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCategorySelectAll(category)}
                          className="h-6 min-w-0 flex-1 overflow-hidden px-2 text-xs"
                          type="button"
                          data-testid={`category-${category.id}-select-all`}
                        >
                          <span className="truncate">全て選択</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCategoryDeselectAll(category)}
                          className="h-6 min-w-0 flex-1 overflow-hidden px-2 text-xs"
                          type="button"
                          data-testid={`category-${category.id}-deselect-all`}
                        >
                          <span className="truncate">全て解除</span>
                        </Button>
                      </div>

                      {/* Source Items */}
                      <div className="space-y-1 pl-6">
                        {categorySources.map((source) => (
                          <label
                            key={source.id}
                            htmlFor={`source-${source.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-[var(--tt-color-surface-hover)]"
                            data-testid={`source-checkbox-${source.id}`}
                          >
                            <Checkbox
                              id={`source-${source.id}`}
                              checked={selectedSources.includes(source.id)}
                              onCheckedChange={() =>
                                handleSourceToggle(source.id)
                              }
                              className="h-4 w-4"
                            />
                            <span className="flex-1 text-xs">
                              {source.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
