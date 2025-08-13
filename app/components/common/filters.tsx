'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter, CheckSquare, Square } from 'lucide-react';
import { TagFilter } from './tag-filter';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; count: number }>;
}

export function Filters({ sources, tags }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const currentTag = searchParams.get('tag');
  
  // Initialize selected sources from URL params
  useEffect(() => {
    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');
    
    if (sourcesParam) {
      setSelectedSources(sourcesParam.split(',').filter(id => id));
    } else if (sourceIdParam) {
      // Backward compatibility
      setSelectedSources([sourceIdParam]);
    } else {
      setSelectedSources([]);
    }
  }, [searchParams]);

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
  
  const applySourceFilter = (sourceIds: string[]) => {
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
    <div className="space-y-3">
      {/* Source Filter */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold">ソース</h3>
          <span className="text-xs text-gray-500">
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
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              すべて選択
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              className="h-7 text-xs justify-start flex-1"
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
    </div>
  );
}