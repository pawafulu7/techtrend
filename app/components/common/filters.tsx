'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckSquare, Square, ChevronDown, ChevronRight, Globe, Building2, FileText, Presentation, Brain, Cpu, Home } from 'lucide-react';
import { DateRangeFilter } from './date-range-filter';
import { groupSourcesByCategory, SourceCategory } from '@/lib/constants/source-categories';
import { getSourceIdsForPreset } from '@/lib/constants/source-presets';
import CategoryFilter from '@/components/filters/CategoryFilter';
import { CompanyFilter } from '@/app/components/source-filters/company-filter';
import { useCompanyFilter } from '@/lib/hooks/use-company-filter';
import type { CompanySource } from '@/lib/providers/company-source';
import type { GroupedSources } from '@/lib/types/source-grouping';
import { getPrimaryCategoryByGroupId } from '@/lib/compatibility/category-group-mapping';

interface FiltersProps {
  sources: Array<{ id: string; name: string }>;
  groupedSources?: GroupedSources[];
  tags: Array<{ id: string; name: string; count: number }>;
  initialSourceIds?: string[];
}

// カテゴリごとのアイコンマッピング（Legacy categories only）
const categoryIcons: Record<string, React.ReactNode> = {
  foreign: <Globe className="w-3 h-3" />,
  domestic: <FileText className="w-3 h-3" />,
  company: <Building2 className="w-3 h-3" />,
  presentation: <Presentation className="w-3 h-3" />,
  ai: <Brain className="w-3 h-3" />,
  llm: <Cpu className="w-3 h-3" />
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

  // Fallback: Try reverse mapping (group → primary category)
  const primaryCategory = getPrimaryCategoryByGroupId(categoryOrGroupId);
  if (primaryCategory && categoryIcons[primaryCategory]) {
    return categoryIcons[primaryCategory];
  }

  // Default icon
  return <FileText className="w-3 h-3" />;
}

export function Filters({ sources, groupedSources, initialSourceIds }: FiltersProps) {
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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const prevSearchParamsRef = useRef<string>('');
  const prevSourcesRef = useRef<Array<{ id: string; name: string }>>(sources);
  const cookieUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueuedSourcesRef = useRef<string[]>(getInitialSources());

  // ソースをカテゴリごとにグループ化
  // Phase 2-A: Use server-provided groupedSources or fallback to static grouping
  const groupedSourcesMap = useMemo(() => {
    if (groupedSources && groupedSources.length > 0) {
      // NEW: Use server-provided grouped sources (Phase 2-A)
      const map = new Map<SourceCategory, Array<{ id: string; name: string }>>();
      groupedSources.forEach(({ group, sources: groupSources }) => {
        // Convert GroupedSources to SourceCategory format for compatibility
        // Use reverse mapping to get semantic category ID (not opaque group UUID)
        const categoryId = getPrimaryCategoryByGroupId(group.id);

        // Skip groups without a primary category mapping
        if (!categoryId) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              `[Filters] No primary category mapping for group ${group.id} (${group.name}). Skipping.`
            );
          }
          return;
        }

        const category: SourceCategory = {
          id: categoryId,
          name: group.name,
          description: '',  // Not used in UI
          sourceIds: groupSources.map(s => s.id),
        };
        map.set(category, groupSources);
      });
      return map;
    }

    // Fallback: Legacy static grouping
    return groupSourcesByCategory(sources);
  }, [groupedSources, sources]);

  // 企業ブログカテゴリーの分離
  const companySources = useMemo(() => {
    const companyEntry = Array.from(groupedSourcesMap.entries()).find(
      ([category]) => category.id === 'company'
    );
    return companyEntry ? companyEntry[1] : [];
  }, [groupedSourcesMap]);

  const companySourceIds = useMemo(
    () => new Set(companySources.map((s) => s.id)),
    [companySources]
  );

  // CompanySource型への変換
  const companySourcesTyped: CompanySource[] = useMemo(
    () =>
      companySources.map((s) => ({
        id: s.id,
        name: s.name,
        isActive: true,
      })),
    [companySources]
  );

  // Company filter hook
  const companyFilter = useCompanyFilter({
    sources: companySourcesTyped,
    initialSelected: selectedSources.filter((id) =>
      companySourceIds.has(id)
    ),
  });

  // URLパラメータが変更されたときに選択状態を更新
  useEffect(() => {
    const currentSearchString = searchParams.toString();

    // Skip if both search params and sources haven't changed
    if (prevSearchParamsRef.current === currentSearchString && prevSourcesRef.current === sources) {
      return;
    }

    prevSearchParamsRef.current = currentSearchString;
    prevSourcesRef.current = sources;

    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');

    if (sourcesParam === 'none') {
      setSelectedSources([]);
    } else if (sourcesParam) {
      setSelectedSources(sourcesParam.split(',').filter(id => id));
    } else if (sourceIdParam) {
      setSelectedSources([sourceIdParam]);
    } else {
      // URLパラメータがない場合は全選択状態（デフォルト）
      setSelectedSources(sources.map(s => s.id));
    }
  }, [searchParams, sources]);

  // アンマウント時に保留中のCookie更新をflush
  useEffect(() => {
    return () => {
      flushCookieUpdate();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // プリセット適用
  const applyPreset = (presetId: string) => {
    // プリセットからソースIDを取得
    // Phase 2-A: Pass groupedSources for DB-backed presets
    const presetSourceIds = getSourceIdsForPreset(presetId, groupedSources);
    if (presetSourceIds.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Preset ${presetId} has no sources`);
      }
      return;
    }

    // 現在有効なソースIDとの整合性チェック
    const validSourceIds = sources.map(s => s.id);
    const filteredSourceIds = presetSourceIds.filter(id => validSourceIds.includes(id));

    if (filteredSourceIds.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`No valid sources found for preset ${presetId}`);
      }
      return;
    }

    // 既存のapplySourceFilter関数を使用
    // これにより自動的にCookieに保存される
    applySourceFilter(filteredSourceIds);
  };

  // カテゴリ単位の選択/解除
  const handleCategorySelectAll = (category: SourceCategory) => {
    const categorySourceIds = category.sourceIds.filter(id => 
      sources.some(s => s.id === id)
    );
    // カテゴリ内のソースのみを選択（他のカテゴリはそのまま）
    const otherSources = selectedSources.filter(id => !category.sourceIds.includes(id));
    const newSelection = [...otherSources, ...categorySourceIds];
    applySourceFilter(newSelection);
  };
  
  const handleCategoryDeselectAll = (category: SourceCategory) => {
    const categorySourceIds = category.sourceIds;
    const newSelection = selectedSources.filter(id => !categorySourceIds.includes(id));
    applySourceFilter(newSelection);
  };

  // Company-specific batch selection handler
  const handleCompanyBatchSelect = (companyIds: string[]) => {
    const nonCompanySelected = selectedSources.filter(
      (id) => !companySourceIds.has(id)
    );
    const nextSelection = [...nonCompanySelected, ...companyIds];
    // Remove duplicates to ensure unique IDs
    applySourceFilter(Array.from(new Set(nextSelection)));
  };

  // カテゴリの展開/折りたたみ
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };
  
  // Cookie更新を実行するヘルパー関数
  const performCookieUpdate = (sourceIds: string[]) => {
    fetch('/api/source-filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceIds }),
    }).catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[filters] /api/source-filter failed', { sourceIds, error });
      }
    });

    fetch('/api/filter-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: sourceIds }),
    }).catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[filters] /api/filter-preferences failed', { sourceIds, error });
      }
    });
  };

  // 保留中のCookie更新を即座に実行（flush）
  const flushCookieUpdate = () => {
    if (cookieUpdateTimeoutRef.current) {
      clearTimeout(cookieUpdateTimeoutRef.current);
      cookieUpdateTimeoutRef.current = null;
    }
    if (lastQueuedSourcesRef.current) {
      performCookieUpdate(lastQueuedSourcesRef.current);
    }
  };

  const applySourceFilter = (sourceIds: string[]) => {
    // 即座に状態を更新（UIの反応性を保つ）
    setSelectedSources(sourceIds);

    // URL構築: Use live location to avoid stale searchParams snapshot
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(searchParams.toString());

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
    const newURL = params.toString() ? `/?${params.toString()}` : '/';

    // URL更新（Next.jsが自動的に競合を制御）
    router.push(newURL);

    // Cookie更新は150msデバウンス
    lastQueuedSourcesRef.current = sourceIds;
    if (cookieUpdateTimeoutRef.current) {
      clearTimeout(cookieUpdateTimeoutRef.current);
    }
    cookieUpdateTimeoutRef.current = setTimeout(() => {
      performCookieUpdate(sourceIds);
    }, 150);
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
              className="h-7 text-xs justify-start flex-1 min-w-0 overflow-hidden"
              data-testid="select-all-button"
              type="button"
              
            >
              <CheckSquare className="w-3 h-3 me-1 flex-shrink-0" />
              <span className="truncate">全て選択</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              className="h-7 text-xs justify-start flex-1 min-w-0 overflow-hidden"
              data-testid="deselect-all-button"
              type="button"
              
            >
              <Square className="w-3 h-3 me-1 flex-shrink-0" />
              <span className="truncate">全て解除</span>
            </Button>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('company')}
              className="h-7 text-xs border-blue-200 hover:bg-blue-50 hover:border-blue-400 dark:border-blue-800 dark:hover:bg-blue-950 transition-all"
              data-testid="preset-company"
              type="button"
              title="日本企業の技術ブログのみ"
              
            >
              <Building2 className="w-3 h-3 me-1" />
              国内企業
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('ai-ml')}
              className="h-7 text-xs border-purple-200 hover:bg-purple-50 hover:border-purple-400 dark:border-purple-800 dark:hover:bg-purple-950 transition-all"
              data-testid="preset-ai-ml"
              type="button"
              title="AI・機械学習関連の情報のみ"
              
            >
              <Brain className="w-3 h-3 me-1" />
              AI/ML
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('foreign')}
              className="h-7 text-xs border-green-200 hover:bg-green-50 hover:border-green-400 dark:border-green-800 dark:hover:bg-green-950 transition-all"
              data-testid="preset-foreign"
              type="button"
              title="海外の技術情報サイトのみ"
              
            >
              <Globe className="w-3 h-3 me-1" />
              海外
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset('domestic-all')}
              className="h-7 text-xs border-orange-200 hover:bg-orange-50 hover:border-orange-400 dark:border-orange-800 dark:hover:bg-orange-950 transition-all"
              data-testid="preset-domestic-all"
              type="button"
              title="日本の技術情報全般（情報サイト+企業ブログ）"
              
            >
              <Home className="w-3 h-3 me-1" />
              国内全般
            </Button>
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
            {Array.from(groupedSourcesMap.entries()).map(([category, categorySources]) => {
              // Skip company category (already rendered above)
              if (category.id === 'company') {
                return null;
              }

              const isExpanded = expandedCategories.has(category.id);
              const categorySelectedCount = categorySources.filter(s =>
                selectedSources.includes(s.id)
              ).length;

              return (
                <div
                  key={category.id}
                  className="border rounded-md"
                  data-testid={`category-${category.id}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => toggleCategory(category.id)}
                    type="button"
                    data-testid={`category-${category.id}-header`}
                  >
                    <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        {getCategoryIcon(category.id)}
                        <span className="text-xs font-medium">{category.name}</span>
                        <span className="text-xs text-gray-500" data-testid={`category-${category.id}-count`}>
                          ({categorySelectedCount}/{categorySources.length})
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-2 pb-2" data-testid={`category-${category.id}-content`}>
                        {/* Category Actions */}
                        <div className="flex gap-1 mb-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCategorySelectAll(category)}
                            className="h-6 text-xs px-2 flex-1 min-w-0 overflow-hidden"
                            type="button"
                            data-testid={`category-${category.id}-select-all`}

                          >
                            <span className="truncate">全て選択</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCategoryDeselectAll(category)}
                            className="h-6 text-xs px-2 flex-1 min-w-0 overflow-hidden"
                            type="button"
                            data-testid={`category-${category.id}-deselect-all`}

                          >
                            <span className="truncate">全て解除</span>
                          </Button>
                        </div>

                        {/* Source Items */}
                        <div className="space-y-1 pl-6">
                          {categorySources.map((source) => (
                            <div
                              key={source.id}
                              className="flex items-center gap-2 py-1 px-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                              onClick={(e) => {
                                // Prevent double toggle when clicking directly on checkbox
                                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                  handleSourceToggle(source.id);
                                }
                              }}
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
                  )}
                </div>
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
      
      {/* Category Filter */}
      <div className="mt-4">
        <CategoryFilter />
      </div>
    </div>
  );
}
