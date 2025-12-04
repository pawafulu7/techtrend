'use client';

import { useState, useMemo } from 'react';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanySelectionDialog } from './company-selection-dialog';
import type { CompanySource } from '@/lib/providers/company-source';
import { DEVELOPERSIO_SOURCE_IDS } from '@/lib/constants/source-categories';

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

  // Filter selectedSourceIds to only company blog sources
  // Performance: Use Set for O(n+m) instead of O(n×m) with some()
  const selectedCompanySourceIds = useMemo(
    () => {
      const sourceIdSet = new Set(sources.map((s) => s.id));
      return selectedSourceIds.filter((id) => sourceIdSet.has(id));
    },
    [selectedSourceIds, sources]
  );

  // Controlled or uncontrolled expansion
  const expanded = isExpanded ?? internalExpanded;
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
  const [developersioExpanded, setDevelopersioExpanded] = useState(true);

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

  // DevelopersIO selection count
  const developersioSelectedCount = useMemo(
    () => selectedCompanySourceIds.filter(id => developersioSourceIdSet.has(id)).length,
    [selectedCompanySourceIds, developersioSourceIdSet]
  );

  const commandEmpty = useMemo(() => {
    return searchValue.length > 0
      ? '該当企業がありません'
      : '企業が登録されていません';
  }, [searchValue]);

  return (
    <>
      <div className="border rounded-md" data-testid="company-filter">
        <button
          className="w-full text-left"
          onClick={toggleExpanded}
          type="button"
          data-testid="company-filter-trigger"
        >
          <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
            <div className="flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Building2 className="w-3 h-3" />
              <span className="text-xs font-medium">企業ブログ</span>
              <span
                className="text-xs text-gray-500"
                data-testid="company-filter-count"
              >
                ({selectedCount}/{totalCount})
              </span>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="px-2 pb-2" data-testid="company-filter-content">
            {/* Command search */}
            <Command className="rounded-md border">
              <CommandInput
                placeholder="企業名で検索..."
                value={searchValue}
                onValueChange={onSearchChange}
                aria-label="企業名検索"
              />
              <CommandList className="max-h-44 overflow-y-auto">
                <CommandEmpty>{commandEmpty}</CommandEmpty>
                {/* DevelopersIO subgroup */}
                {developersioSources.length > 0 && (
                  <Collapsible
                    open={developersioExpanded}
                    onOpenChange={setDevelopersioExpanded}
                    className="border-b"
                  >
                    <CollapsibleTrigger asChild>
                      <CommandItem
                        value="developersio-group"
                        className="flex items-center gap-2 cursor-pointer font-medium"
                        data-testid="developersio-group-trigger"
                      >
                        {developersioExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <span className="text-xs flex-1">DevelopersIO</span>
                        <span className="text-xs text-muted-foreground">
                          ({developersioSelectedCount}/{developersioSources.length})
                        </span>
                      </CommandItem>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {developersioSources.map((source) => {
                        const checked = selectedCompanySourceIds.includes(source.id);
                        // Display tag name without "DevelopersIO " prefix
                        const displayName = source.name.startsWith('DevelopersIO ')
                          ? source.name.slice('DevelopersIO '.length)
                          : source.name;
                        return (
                          <CommandItem
                            key={source.id}
                            value={source.id}
                            onSelect={() => onSourceToggle(source.id)}
                            className={cn(
                              'flex items-center gap-2 cursor-pointer pl-6',
                              checked && 'bg-muted/40'
                            )}
                            data-testid={`company-item-${source.id}`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => onSourceToggle(source.id)}
                              aria-label={`${source.name}を選択`}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-xs flex-1">{displayName}</span>
                          </CommandItem>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {/* Other company sources */}
                {otherSources.map((source) => {
                  const checked = selectedCompanySourceIds.includes(source.id);
                  return (
                    <CommandItem
                      key={source.id}
                      value={source.id}
                      onSelect={() => onSourceToggle(source.id)}
                      className={cn(
                        'flex items-center gap-2 cursor-pointer',
                        checked && 'bg-muted/40'
                      )}
                      data-testid={`company-item-${source.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onSourceToggle(source.id)}
                        aria-label={`${source.name}を選択`}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs flex-1">{source.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>

            {/* Footer with selection count and modal trigger */}
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>{selectedCount} 件選択中</span>
              <Button
                variant="link"
                size="sm"
                className="px-0 h-auto"
                onClick={() => setDialogOpen(true)}
                data-testid="company-filter-manage-all"
              >
                すべて管理...
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Company selection dialog */}
      <CompanySelectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sources={sources}
        selectedSources={selectedCompanySourceIds}
        onApply={onBatchSelect}
      />
    </>
  );
}
