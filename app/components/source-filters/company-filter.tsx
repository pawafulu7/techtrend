'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui-v2/button-v2';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import type { CompanySource } from '@/lib/providers/company-source';
import { DEVELOPERSIO_SOURCE_IDS } from '@/lib/constants/source-categories';
import {
  createLazyComponent,
  LazyLoadFailed,
} from '@/app/components/common/lazy-component';

// cmdk（企業名の検索リスト）は欄を開いたときだけ要るので、初回表示の JS に含めない（Issue #718）。
// 見出しに触れた時点で読み始め、読み込み中と読み込めなかったときは検索リストと同じ高さの枠を出す
const { Component: CompanyFilterList, preload: preloadCompanyFilterList } =
  createLazyComponent(() =>
    import('./company-filter-list').then((mod) => ({
      default: mod.CompanyFilterList,
    }))
  );
const LIST_FRAME_CLASS =
  'h-[223px] rounded-md border bg-(--tt-color-surface-muted)';

const {
  Component: CompanySelectionDialog,
  preload: preloadCompanySelectionDialog,
} = createLazyComponent(() =>
  import('./company-selection-dialog').then((mod) => ({
    default: mod.CompanySelectionDialog,
  }))
);

export interface CompanyFilterProps {
  sources: CompanySource[];
  visibleSources: CompanySource[];
  selectedSourceIds: string[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSourceToggle: (sourceId: string) => void;
  onBatchSelect: (sourceIds: string[]) => void;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * Company filter component
 * Sidebar filter for company blog sources with search and modal dialog
 */
export function CompanyFilter({
  sources,
  visibleSources,
  selectedSourceIds,
  searchValue,
  onSearchChange,
  onSourceToggle,
  onBatchSelect,
  isExpanded,
  onExpandedChange,
}: CompanyFilterProps) {
  // UI-only local state
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // ダイアログは初めて開くまで描かない（描くと遅延読み込みの chunk を読むため）。閉じるアニメーションのため、
  // 一度開いたら描き続ける。開くたびに key を変えて描き直し、読み込みに失敗した後も読み直す
  const [dialogOpenCount, setDialogOpenCount] = useState(0);

  // Filter selectedSourceIds to only company blog sources
  // Performance: Use Set for O(n+m) instead of O(n×m) with some()
  const selectedCompanySourceIds = useMemo(() => {
    const sourceIdSet = new Set(sources.map((s) => s.id));
    return selectedSourceIds.filter((id) => sourceIdSet.has(id));
  }, [selectedSourceIds, sources]);

  // Controlled or uncontrolled expansion
  const expanded = isExpanded ?? internalExpanded;

  // 欄を閉じたら、chunk の読み込み待ちで開く予定だったダイアログも取り消す（再展開で突然開かないように）
  useEffect(() => {
    if (!expanded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: cancel the pending dialog when the section collapses
      setDialogOpen(false);
    }
  }, [expanded]);
  const toggleExpanded = () => {
    const next = !expanded;
    onExpandedChange?.(next);
    if (isExpanded === undefined) {
      setInternalExpanded(next);
    }
  };

  // Count only company blog sources that are selected
  const selectedCount = selectedCompanySourceIds.length;
  const totalCount = sources.length;

  // DevelopersIO subgroup state
  const [developersioExpanded, setDevelopersioExpanded] = useState(false);

  // Separate DevelopersIO sources from other sources
  const developersioSourceIdSet = useMemo(
    () => new Set(DEVELOPERSIO_SOURCE_IDS as readonly string[]),
    []
  );

  const { developersioSources, otherSources } = useMemo(() => {
    const devio: CompanySource[] = [];
    const others: CompanySource[] = [];
    for (const source of visibleSources) {
      if (developersioSourceIdSet.has(source.id)) {
        devio.push(source);
      } else {
        others.push(source);
      }
    }
    return { developersioSources: devio, otherSources: others };
  }, [visibleSources, developersioSourceIdSet]);

  // DevelopersIO selection count (based on visible sources to avoid count > total)
  const developersioSelectedCount = useMemo(
    () =>
      developersioSources.filter((source) =>
        selectedCompanySourceIds.includes(source.id)
      ).length,
    [developersioSources, selectedCompanySourceIds]
  );

  return (
    <>
      <div className="rounded-md border" data-testid="company-filter">
        <button
          className="w-full text-left"
          onClick={toggleExpanded}
          onPointerEnter={preloadCompanyFilterList}
          onFocus={preloadCompanyFilterList}
          type="button"
          data-testid="company-filter-trigger"
        >
          <div className="flex items-center justify-between p-2 hover:bg-[var(--tt-color-surface-hover)]">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Building2 className="h-3 w-3" />
              <span className="text-xs font-medium">企業ブログ</span>
              <span
                className="text-xs text-[var(--tt-color-text-muted)]"
                data-testid="company-filter-count"
              >
                ({selectedCount}/{totalCount})
              </span>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="px-2 pb-2" data-testid="company-filter-content">
            <CompanyFilterList
              developersioSources={developersioSources}
              otherSources={otherSources}
              developersioSelectedCount={developersioSelectedCount}
              selectedCompanySourceIds={selectedCompanySourceIds}
              searchValue={searchValue}
              onSearchChange={onSearchChange}
              onSourceToggle={onSourceToggle}
              developersioExpanded={developersioExpanded}
              onDevelopersioExpandedChange={setDevelopersioExpanded}
              fallback={
                <div
                  className={`${LIST_FRAME_CLASS} motion-safe:animate-pulse`}
                  aria-hidden="true"
                  data-testid="company-filter-list-placeholder"
                />
              }
              errorFallback={
                <div
                  className={`${LIST_FRAME_CLASS} flex items-center justify-center`}
                >
                  <LazyLoadFailed />
                </div>
              }
            />

            {/* Footer with selection count and modal trigger */}
            <div className="text-muted-foreground mt-2 flex items-center justify-between px-1 text-xs">
              <span>{selectedCount} 件選択中</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => {
                  setDialogOpenCount((count) => count + 1);
                  setDialogOpen(true);
                }}
                onPointerEnter={preloadCompanySelectionDialog}
                onFocus={preloadCompanySelectionDialog}
                data-testid="company-filter-manage-all"
              >
                すべて管理...
              </Button>
            </div>

            {/* Company selection dialog */}
            {dialogOpenCount > 0 && (
              <CompanySelectionDialog
                key={dialogOpenCount}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                sources={sources}
                selectedSources={selectedCompanySourceIds}
                onApply={onBatchSelect}
                fallback={null}
                errorFallback={<LazyLoadFailed className="mt-1 px-1" />}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
