'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckSquare, Square } from 'lucide-react';
import { DateRangeFilter } from './date-range-filter';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; count: number }>;
  initialSourceIds?: string[];
}

export function Filters({ sources, initialSourceIds }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 初期値の決定
  const getInitialSources = () => {
    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');
    
    if (sourcesParam === 'none') {
      return [];
    } else if (sourcesParam) {
      return sourcesParam.split(',').filter(id => id);
    } else if (sourceIdParam) {
      return [sourceIdParam];
    } else if (initialSourceIds !== undefined) {
      // サーバーから渡されたCookie値を使用
      // 有効なソースIDのみをフィルタリング
      const validSourceIds = sources.map(s => s.id);
      return initialSourceIds.filter(id => validSourceIds.includes(id));
    } else {
      return sources.map(s => s.id);
    }
  };
  
  const [selectedSources, setSelectedSources] = useState<string[]>(getInitialSources);
  
  // URLパラメータが変更されたときに選択状態を更新
  useEffect(() => {
    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');
    
    if (sourcesParam === 'none') {
      setSelectedSources([]);
    } else if (sourcesParam) {
      setSelectedSources(sourcesParam.split(',').filter(id => id));
    } else if (sourceIdParam) {
      setSelectedSources([sourceIdParam]);
    }
    // URLパラメータがない場合は現在の状態を維持
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
  
  const applySourceFilterRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  const applySourceFilter = async (sourceIds: string[]) => {
    // 即座に状態を更新（UIの反応性を保つ）
    setSelectedSources(sourceIds);
    
    // 前のタイマーをクリア
    if (applySourceFilterRef.current) {
      clearTimeout(applySourceFilterRef.current);
    }
    
    // デバウンス処理（高速クリック対策）
    applySourceFilterRef.current = setTimeout(async () => {
      const params = new URLSearchParams(searchParams.toString());
      
      // Remove old params
      params.delete('sourceId');
      params.delete('sources');
      params.delete('page'); // ページパラメータも削除
      
      if (sourceIds.length === 0) {
        // 明示的に「何も選択しない」状態を示す
        params.set('sources', 'none');
      } else if (sourceIds.length === sources.length) {
        // 全選択の場合、明示的に'sources'パラメータを削除して
        // デフォルト状態（全選択）にする
        // パラメータは既に削除済みなので、何もしない
      } else {
        // 一部のソースが選択されている
        params.set('sources', sourceIds.join(','));
      }
      
      // URLを構築（パラメータがない場合は "/" のみ）
      const url = params.toString() ? `/?${params.toString()}` : '/';
      router.push(url);
      
      // Update both old source-filter cookie and new filter preferences
      try {
        // Update old cookie for backward compatibility
        await fetch('/api/source-filter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceIds }),
        });
        
        // Update filter preferences cookie
        // 全選択の場合も実際のソースIDを保存（UIの状態を維持）
        // 空配列の場合は空配列として保存（明示的な全解除）
        await fetch('/api/filter-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: sourceIds }),
        });
      } catch (error) {
        // Silently fail cookie update - URL params are the primary source
        console.error('Failed to update filter cookies:', error);
      }
    }, 150); // 150ms のデバウンス
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
              type="button"
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
              type="button"
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