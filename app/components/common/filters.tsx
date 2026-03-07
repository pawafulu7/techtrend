'use client';

import { DateRangeFilter } from './date-range-filter';
import { useSourceFilter } from './hooks/useSourceFilter';
import { SourceFilterPanel } from './SourceFilterPanel';
import CategoryFilter from '@/components/filters/CategoryFilter';
import type { GroupedSources } from '@/lib/types/source-grouping';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  groupedSources?: GroupedSources[];
  tags: Array<{ id: string; name: string; count: number }>;
  initialSourceIds?: string[];
}

export function Filters({
  sources,
  groupedSources,
  initialSourceIds,
}: FiltersProps) {
  const sourceFilter = useSourceFilter({
    sources,
    groupedSources,
    initialSourceIds,
  });

  return (
    <div className="space-y-3" data-testid="filter-area">
      {/* Source Filter with Categories */}
      <SourceFilterPanel
        sources={sources}
        selectedSources={sourceFilter.selectedSources}
        expandedCategories={sourceFilter.expandedCategories}
        setExpandedCategories={sourceFilter.setExpandedCategories}
        groupedSourcesMap={sourceFilter.groupedSourcesMap}
        companySources={sourceFilter.companySources}
        companySourcesTyped={sourceFilter.companySourcesTyped}
        companyFilter={sourceFilter.companyFilter}
        handleSourceToggle={sourceFilter.handleSourceToggle}
        handleSelectAll={sourceFilter.handleSelectAll}
        handleDeselectAll={sourceFilter.handleDeselectAll}
        applyPreset={sourceFilter.applyPreset}
        handleCategorySelectAll={sourceFilter.handleCategorySelectAll}
        handleCategoryDeselectAll={sourceFilter.handleCategoryDeselectAll}
        handleCompanyBatchSelect={sourceFilter.handleCompanyBatchSelect}
        toggleCategory={sourceFilter.toggleCategory}
        applySourceFilter={sourceFilter.applySourceFilter}
      />

      {/* Tag Filter - デスクトップでは非表示（ヘッダーに移動） */}
      {/* モバイルではMobileFilters内で表示 */}

      {/* Date Range Filter */}
      <div className="mt-4">
        <DateRangeFilter />
      </div>

      {/* Category Filter */}
      <div className="mt-4">
        <CategoryFilter />
      </div>
    </div>
  );
}
