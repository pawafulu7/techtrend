'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface SearchFiltersProps {
  facets: {
    tags: { name: string; count: number }[];
    sources: { name: string; count: number }[];
    difficulty: { level: string; count: number }[];
  };
  selectedTags: string[];
  selectedSources: string[];
  selectedDifficulty: string[];
}

export function SearchFilters({
  facets,
  selectedTags,
  selectedSources,
  selectedDifficulty,
}: SearchFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openSections, setOpenSections] = useState({
    tags: true,
    sources: true,
    difficulty: true,
  });

  const updateFilter = (type: 'tags' | 'sources' | 'difficulty', value: string, add: boolean) => {
    const params = new URLSearchParams(searchParams);
    const currentValues = params.getAll(type);

    if (add) {
      params.append(type, value);
    } else {
      params.delete(type);
      currentValues.filter(v => v !== value).forEach(v => params.append(type, v));
    }

    // ページをリセット
    params.set('page', '1');
    
    router.push(`/search?${params.toString()}`);
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('tags');
    params.delete('sources');
    params.delete('difficulty');
    params.set('page', '1');
    
    router.push(`/search?${params.toString()}`);
  };

  const hasActiveFilters = selectedTags.length > 0 || 
                          selectedSources.length > 0 || 
                          selectedDifficulty.length > 0;

  const getDifficultyLabel = (level: string) => {
    switch (level) {
      case 'beginner':
        return '初級';
      case 'intermediate':
        return '中級';
      case 'advanced':
        return '上級';
      default:
        return level;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">フィルター</h2>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs"
          >
            すべてクリア
          </Button>
        )}
      </div>

      {/* タグフィルター */}
      {facets.tags.length > 0 && (
        <Collapsible
          open={openSections.tags}
          onOpenChange={(open) => setOpenSections(prev => ({ ...prev, tags: open }))}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-accent rounded-md px-2">
            <span className="font-medium">タグ</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                openSections.tags ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="space-y-2">
              {facets.tags.map((tag) => {
                const isSelected = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.name}
                    onClick={() => updateFilter('tags', tag.name, !isSelected)}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span className="truncate">{tag.name}</span>
                    <span className="text-xs ml-2 flex-shrink-0">
                      {tag.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ソースフィルター */}
      {facets.sources.length > 0 && (
        <Collapsible
          open={openSections.sources}
          onOpenChange={(open) => setOpenSections(prev => ({ ...prev, sources: open }))}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-accent rounded-md px-2">
            <span className="font-medium">ソース</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                openSections.sources ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="space-y-2">
              {facets.sources.map((source) => {
                const isSelected = selectedSources.includes(source.name);
                return (
                  <button
                    key={source.name}
                    onClick={() => updateFilter('sources', source.name, !isSelected)}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span className="truncate">{source.name}</span>
                    <span className="text-xs ml-2 flex-shrink-0">
                      {source.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 難易度フィルター */}
      {facets.difficulty.length > 0 && (
        <Collapsible
          open={openSections.difficulty}
          onOpenChange={(open) => setOpenSections(prev => ({ ...prev, difficulty: open }))}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 hover:bg-accent rounded-md px-2">
            <span className="font-medium">難易度</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                openSections.difficulty ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="space-y-2">
              {facets.difficulty.map((diff) => {
                const isSelected = selectedDifficulty.includes(diff.level);
                return (
                  <button
                    key={diff.level}
                    onClick={() => updateFilter('difficulty', diff.level, !isSelected)}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span>{getDifficultyLabel(diff.level)}</span>
                    <span className="text-xs ml-2 flex-shrink-0">
                      {diff.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* アクティブフィルター */}
      {hasActiveFilters && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-2">選択中のフィルター</h3>
          <div className="space-y-2">
            {selectedTags.map((tag) => (
              <Badge
                key={`tag-${tag}`}
                variant="secondary"
                className="mr-2 mb-2"
              >
                {tag}
                <button
                  onClick={() => updateFilter('tags', tag, false)}
                  className="ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedSources.map((source) => (
              <Badge
                key={`source-${source}`}
                variant="secondary"
                className="mr-2 mb-2"
              >
                {source}
                <button
                  onClick={() => updateFilter('sources', source, false)}
                  className="ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedDifficulty.map((diff) => (
              <Badge
                key={`difficulty-${diff}`}
                variant="secondary"
                className="mr-2 mb-2"
              >
                {getDifficultyLabel(diff)}
                <button
                  onClick={() => updateFilter('difficulty', diff, false)}
                  className="ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}