'use client';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompanySource } from '@/lib/providers/company-source';

export interface CompanyFilterListProps {
  developersioSources: CompanySource[];
  otherSources: CompanySource[];
  developersioSelectedCount: number;
  selectedCompanySourceIds: string[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSourceToggle: (sourceId: string) => void;
  developersioExpanded: boolean;
  onDevelopersioExpandedChange: (open: boolean) => void;
}

/**
 * 企業ブログ欄を開いたときの検索リスト。
 * cmdk を初回表示の JS に含めないよう、company-filter.tsx から遅延読み込みする（Issue #718）
 */
export function CompanyFilterList({
  developersioSources,
  otherSources,
  developersioSelectedCount,
  selectedCompanySourceIds,
  searchValue,
  onSearchChange,
  onSourceToggle,
  developersioExpanded,
  onDevelopersioExpandedChange,
}: CompanyFilterListProps) {
  return (
    <Command className="rounded-md border">
      <CommandInput
        placeholder="企業名で検索..."
        value={searchValue}
        onValueChange={onSearchChange}
        aria-label="企業名検索"
      />
      <CommandList className="max-h-44 overflow-y-auto">
        <CommandEmpty>
          {searchValue.length > 0
            ? '該当企業がありません'
            : '企業が登録されていません'}
        </CommandEmpty>
        {/* DevelopersIO subgroup */}
        {developersioSources.length > 0 && (
          <Collapsible
            open={developersioExpanded}
            onOpenChange={onDevelopersioExpandedChange}
            className={otherSources.length > 0 ? 'border-b' : ''}
          >
            <CollapsibleTrigger
              className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium"
              data-testid="developersio-group-trigger"
            >
              {developersioExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span className="flex-1 text-xs">DevelopersIO</span>
              <span className="text-muted-foreground text-xs">
                ({developersioSelectedCount}/{developersioSources.length})
              </span>
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
                      'flex cursor-pointer items-center gap-2 pl-6',
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
                    <span className="flex-1 text-xs">{displayName}</span>
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
                'flex cursor-pointer items-center gap-2',
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
              <span className="flex-1 text-xs">{source.name}</span>
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}
