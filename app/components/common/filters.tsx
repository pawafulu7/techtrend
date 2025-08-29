'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import * as Collapsible from '@radix-ui/react-collapsible';
import { CheckSquare, Square, ChevronDown, ChevronRight, Globe, Building2, FileText, Presentation } from 'lucide-react';
import { DateRangeFilter } from './date-range-filter';
import { groupSourcesByCategory, SourceCategory, getAllCategories, getSourceIdsByCategory } from '@/lib/constants/source-categories';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; count: number }>;
  initialSourceIds?: string[];
}

// カテゴリごとのアイコンマッピング
const categoryIcons: Record<string, React.ReactNode> = {
  foreign: <Globe className="w-3 h-3" />,
  domestic: <FileText className="w-3 h-3" />,
  company: <Building2 className="w-3 h-3" />,
  presentation: <Presentation className="w-3 h-3" />
};

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
  const [expandedCategories, setExpandedCategories] = useState<string[]>(getAllCategories().map(c => c.id));
  
  // ソースをカテゴリごとにグループ化
  const groupedSources = groupSourcesByCategory(sources);
  
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
  
  // カテゴリ単位の選択/解除
  const handleCategorySelectAll = (category: SourceCategory) => {
    const categorySourceIds = category.sourceIds.filter(id => 
      sources.some(s => s.id === id)
    );
    const newSelection = [...new Set([...selectedSources, ...categorySourceIds])];
    applySourceFilter(newSelection);
  };
  
  const handleCategoryDeselectAll = (category: SourceCategory) => {
    const categorySourceIds = category.sourceIds;
    const newSelection = selectedSources.filter(id => !categorySourceIds.includes(id));
    applySourceFilter(newSelection);
  };
  
  // カテゴリの展開/折りたたみ
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
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
      }
    }, 150); // 150ms のデバウンス
  };

  return (
    <div className="space-y-3" data-testid="filter-area">
      {/* Source Filter with Categories */}
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg p-3 border border-white/20 shadow-sm" data-testid="source-filter">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold">ソース</h3>
          <span className="text-xs text-gray-500" data-testid="source-count">
            {selectedSources.length}/{sources.length}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 mb-2">
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
          
          {/* Categories */}
          <div className="space-y-2">
            {Array.from(groupedSources.entries()).map(([category, categorySources]) => {
              const isExpanded = expandedCategories.includes(category.id);
              const categorySelectedCount = categorySources.filter(s => 
                selectedSources.includes(s.id)
              ).length;
              
              return (
                <Collapsible.Root
                  key={category.id}
                  open={isExpanded}
                  onOpenChange={() => toggleCategory(category.id)}
                >
                  <div className="border rounded-md">
                    <Collapsible.Trigger className="w-full">
                      <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          {categoryIcons[category.id]}
                          <span className="text-xs font-medium">{category.name}</span>
                          <span className="text-xs text-gray-500">
                            ({categorySelectedCount}/{categorySources.length})
                          </span>
                        </div>
                      </div>
                    </Collapsible.Trigger>
                    
                    <Collapsible.Content>
                      <div className="px-2 pb-2">
                        {/* Category Actions */}
                        <div className="flex gap-1 mb-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCategorySelectAll(category);
                            }}
                            className="h-6 text-xs px-2"
                            type="button"
                          >
                            全選択
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCategoryDeselectAll(category);
                            }}
                            className="h-6 text-xs px-2"
                            type="button"
                          >
                            全解除
                          </Button>
                        </div>
                        
                        {/* Source Items */}
                        <div className="space-y-1 pl-6">
                          {categorySources.map((source) => (
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
                    </Collapsible.Content>
                  </div>
                </Collapsible.Root>
              );
            })}
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