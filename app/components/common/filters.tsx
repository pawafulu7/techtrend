'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter, CheckSquare, Square } from 'lucide-react';
import { TagFilter } from './tag-filter';
import { DateRangeFilter } from './date-range-filter';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; count: number }>;
  initialSourceIds?: string[];
}

export function Filters({ sources, tags, initialSourceIds }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const isMounted = useRef(false);
  const currentTag = searchParams.get('tag');
  
  // Initialize selected sources from URL params or cookie
  useEffect(() => {
    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');
    
    if (sourcesParam) {
      // URL parameter takes priority
      setSelectedSources(sourcesParam.split(',').filter(id => id));
    } else if (sourceIdParam) {
      // Backward compatibility with single sourceId
      setSelectedSources([sourceIdParam]);
    } else if (!isMounted.current) {
      // On initial mount, use cookie value or default to all selected
      if (initialSourceIds && initialSourceIds.length > 0) {
        // Use cookie value if available
        setSelectedSources(initialSourceIds);
      } else {
        // Default to all selected
        setSelectedSources(sources.map(s => s.id));
      }
    }
    // Otherwise keep the current state (important for "deselect all" to work)
    
    isMounted.current = true;
  }, [searchParams, sources, initialSourceIds]);

  const handleSourceToggle = (sourceId: string) => {
    const newSelection = selectedSources.includes(sourceId)
      ? selectedSources.filter(id => id !== sourceId)
      : [...selectedSources, sourceId];
    
    applySourceFilter(newSelection);
  };
  
  const handleSelectAll = () => {
    // Always select all sources
    applySourceFilter(sources.map(s => s.id));
  };
  
  const handleDeselectAll = () => {
    // Clear all selections
    applySourceFilter([]);
  };
  
  const applySourceFilter = async (sourceIds: string[]) => {
    setSelectedSources(sourceIds);
    const params = new URLSearchParams(searchParams.toString());
    
    // Remove old params
    params.delete('sourceId');
    params.delete('sources');
    
    if (sourceIds.length > 0 && sourceIds.length < sources.length) {
      // Set sources param only if not all selected
      params.set('sources', sourceIds.join(','));
    }
    
    params.set('page', '1'); // Reset to first page
    router.push(`/?${params.toString()}`);
    
    // Update both old source-filter cookie and new filter preferences
    try {
      // Update old cookie for backward compatibility
      await fetch('/api/source-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds }),
      });
      
      // Update filter preferences cookie
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: sourceIds.length > 0 ? sourceIds : undefined }),
      });
    } catch (error) {
      // Silently fail cookie update - URL params are the primary source
      console.error('Failed to update filter cookies:', error);
    }
  };

  const handleTagFilter = (tagName: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tagName) {
      params.set('tag', tagName);
    } else {
      params.delete('tag');
    }
    params.set('page', '1'); // Reset to first page
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="space-y-3" data-testid="filter-area">
      {/* Source Filter */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-sm" data-testid="source-filter">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold">ソース</h3>
          <span className="text-xs text-gray-500" data-testid="source-count">
            {selectedSources.length}/{sources.length}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="h-7 text-xs justify-start flex-1"
              data-testid="select-all-button"
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              すべて選択
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              className="h-7 text-xs justify-start flex-1"
              data-testid="deselect-all-button"
            >
              <Square className="w-3 h-3 mr-1" />
              すべて解除
            </Button>
          </div>
          <div className="border-t pt-1">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-2 py-1 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                onClick={() => handleSourceToggle(source.id)}
                data-testid={`source-checkbox-${source.id}`}
              >
                <Checkbox
                  checked={selectedSources.includes(source.id)}
                  onCheckedChange={() => handleSourceToggle(source.id)}
                  className="h-4 w-4"
                  onClick={(e) => e.stopPropagation()}
                />
                <label className="text-xs cursor-pointer flex-1">
                  {source.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tag Filter - デスクトップでは非表示（ヘッダーに移動） */}
      {/* モバイルではMobileFilters内で表示 */}
      
      {/* Date Range Filter */}
      <div className="mt-4">
        <DateRangeFilter />
      </div>
    </div>
  );
}