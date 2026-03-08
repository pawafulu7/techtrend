'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  groupSourcesByCategory,
  SourceCategory,
  type SourceCategoryId,
  VALID_CATEGORY_IDS,
  SOURCE_CATEGORIES,
} from '@/lib/constants/source-categories';
import { getSourceIdsForPreset } from '@/lib/constants/source-presets';
import { useCompanyFilter } from '@/lib/hooks/use-company-filter';
import type { CompanySource } from '@/lib/providers/company-source';
import type { GroupedSources } from '@/lib/types/source-grouping';
import { getPrimaryCategoryByGroupId } from '@/lib/compatibility/category-group-mapping';

interface UseSourceFilterParams {
  sources: Array<{ id: string; name: string }>;
  groupedSources?: GroupedSources[];
  initialSourceIds?: string[];
}

export function useSourceFilter({
  sources,
  groupedSources,
  initialSourceIds,
}: UseSourceFilterParams) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // 初期値の決定
  const getInitialSources = () => {
    // サーバーサイドで処理されたinitialSourceIdsを最優先
    // undefined = 全選択（sources=all または パラメータなしのデフォルト）
    // 空配列 = 全解除（sources=none）
    // 配列 = 特定のソース

    // initialSourceIdsがundefinedの場合、サーバーサイドで「全選択」と判断された
    if (initialSourceIds === undefined) {
      return sources.map((s) => s.id);
    }

    // initialSourceIdsが空配列の場合、サーバーサイドで「全解除」と判断された
    if (initialSourceIds.length === 0) {
      return [];
    }

    // initialSourceIdsに有効なソースIDがある場合
    const validSourceIds = sources.map((s) => s.id);
    const filtered = initialSourceIds.filter((id) =>
      validSourceIds.includes(id)
    );
    if (filtered.length > 0) {
      return filtered;
    }

    // フォールバック：全選択
    return sources.map((s) => s.id);
  };

  const [selectedSources, setSelectedSources] =
    useState<string[]>(getInitialSources);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const prevSearchParamsRef = useRef<string>('');
  const prevSourcesRef = useRef<Array<{ id: string; name: string }>>(sources);
  const cookieUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastQueuedSourcesRef = useRef<string[]>(getInitialSources());

  // ソースをカテゴリごとにグループ化
  // Phase 2-A: Use server-provided groupedSources or fallback to static grouping
  const groupedSourcesMap = useMemo(() => {
    if (groupedSources && groupedSources.length > 0) {
      // NEW: Use server-provided grouped sources (Phase 2-A)
      // Step 1: Merge groups with the same categoryId
      const mergedMap = new Map<string, Array<{ id: string; name: string }>>();

      groupedSources.forEach(({ group, sources: groupSources }) => {
        // Convert GroupedSources to SourceCategory format for compatibility
        // Try reverse mapping first (for DB-backed groups like 'group_company_japan')
        let categoryId = getPrimaryCategoryByGroupId(group.id);

        // If no mapping found, check if group.id is already a valid SourceCategoryId
        // (for static grouping where group.id = categoryId like 'foreign', 'domestic')
        if (!categoryId) {
          if (VALID_CATEGORY_IDS.includes(group.id as SourceCategoryId)) {
            categoryId = group.id as SourceCategoryId;
          } else {
            // Skip groups without valid category mapping
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                `[Filters] No primary category mapping for group ${group.id} (${group.name}). Skipping.`
              );
            }
            return;
          }
        }

        // Merge sources for the same categoryId
        if (mergedMap.has(categoryId)) {
          const existing = mergedMap.get(categoryId)!;
          existing.push(...groupSources);
        } else {
          mergedMap.set(categoryId, [...groupSources]);
        }
      });

      // Step 2: Convert to Map<SourceCategory, Sources[]>
      const map = new Map<
        SourceCategory,
        Array<{ id: string; name: string }>
      >();
      for (const [categoryId, categorySources] of mergedMap.entries()) {
        // Use canonical category name from SOURCE_CATEGORIES
        const canonicalCategory =
          SOURCE_CATEGORIES[categoryId as SourceCategoryId];
        const category: SourceCategory = {
          id: categoryId as SourceCategoryId,
          name: canonicalCategory?.name || categoryId, // Fallback to categoryId if not found
          description: canonicalCategory?.description || '',
          sourceIds: categorySources.map((s) => s.id),
        };
        map.set(category, categorySources);
      }
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
    initialSelected: selectedSources.filter((id) => companySourceIds.has(id)),
  });

  // URLパラメータが変更されたときに選択状態を更新
  useEffect(() => {
    const currentSearchString = searchParams.toString();

    // Skip if both search params and sources haven't changed
    if (
      prevSearchParamsRef.current === currentSearchString &&
      prevSourcesRef.current === sources
    ) {
      return;
    }

    prevSearchParamsRef.current = currentSearchString;
    prevSourcesRef.current = sources;

    const sourcesParam = searchParams.get('sources');
    const sourceIdParam = searchParams.get('sourceId');

    if (sourcesParam === 'none') {
      setSelectedSources([]);
    } else if (sourcesParam === 'all') {
      // 全選択の場合は全てのソースIDを設定
      setSelectedSources(sources.map((s) => s.id));
    } else if (sourcesParam) {
      // Filter out invalid IDs (excluded or deleted sources)
      const validIds = new Set(sources.map((s) => s.id));
      const parsedIds = [
        ...new Set(
          sourcesParam
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id && validIds.has(id))
        ),
      ];
      // If all IDs were invalid, fall back to all sources
      setSelectedSources(
        parsedIds.length > 0 ? parsedIds : sources.map((s) => s.id)
      );
    } else if (sourceIdParam) {
      const trimmedId = sourceIdParam.trim();
      if (trimmedId) {
        setSelectedSources([trimmedId]);
      }
    }
    // URLパラメータがない場合は既存のstateを維持（cookie由来の初期値を保持）
  }, [searchParams, sources]);

  // アンマウント時に保留中のCookie更新をflush
  useEffect(() => {
    return () => {
      flushCookieUpdate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cookie更新を実行するヘルパー関数
  const performCookieUpdate = (sourceIds: string[]) => {
    fetch('/api/source-filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceIds }),
    }).catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[filters] /api/source-filter failed', {
          sourceIds,
          error,
        });
      }
    });

    fetch('/api/filter-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: sourceIds }),
    }).catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[filters] /api/filter-preferences failed', {
          sourceIds,
          error,
        });
      }
    });
  };

  // 保留中のCookie更新を即座に実行（flush）
  const flushCookieUpdate = () => {
    if (cookieUpdateTimeoutRef.current) {
      clearTimeout(cookieUpdateTimeoutRef.current);
      cookieUpdateTimeoutRef.current = null;
      performCookieUpdate(lastQueuedSourcesRef.current);
    }
  };

  const applySourceFilter = (sourceIds: string[]) => {
    // 即座に状態を更新（UIの反応性を保つ）
    setSelectedSources(sourceIds);

    // URL構築: Use live location to avoid stale searchParams snapshot
    const params =
      typeof window !== 'undefined'
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
      // 全選択の場合は明示的に'all'を設定
      params.set('sources', 'all');
    } else {
      // 一部のソースが選択されている
      params.set('sources', sourceIds.join(','));
    }

    // URLを構築（パラメータがない場合は "/" のみ）
    const newURL = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;

    // URL更新（Next.jsが自動的に競合を制御）
    router.push(newURL);

    // Cookie更新は150msデバウンス
    lastQueuedSourcesRef.current = sourceIds;
    if (cookieUpdateTimeoutRef.current) {
      clearTimeout(cookieUpdateTimeoutRef.current);
    }
    cookieUpdateTimeoutRef.current = setTimeout(() => {
      cookieUpdateTimeoutRef.current = null;
      performCookieUpdate(sourceIds);
    }, 150);
  };

  const handleSourceToggle = (sourceId: string) => {
    const newSelection = selectedSources.includes(sourceId)
      ? selectedSources.filter((id) => id !== sourceId)
      : [...selectedSources, sourceId];

    applySourceFilter(newSelection);
  };

  const handleSelectAll = () => {
    // Always select all sources
    applySourceFilter(sources.map((s) => s.id));
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
    const validSourceIds = sources.map((s) => s.id);
    const filteredSourceIds = presetSourceIds.filter((id) =>
      validSourceIds.includes(id)
    );

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
    const categorySourceIds = category.sourceIds.filter((id) =>
      sources.some((s) => s.id === id)
    );
    // カテゴリ内のソースのみを選択（他のカテゴリはそのまま）
    const otherSources = selectedSources.filter(
      (id) => !category.sourceIds.includes(id)
    );
    const newSelection = [...otherSources, ...categorySourceIds];
    applySourceFilter(newSelection);
  };

  const handleCategoryDeselectAll = (category: SourceCategory) => {
    const categorySourceIds = category.sourceIds;
    const newSelection = selectedSources.filter(
      (id) => !categorySourceIds.includes(id)
    );
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
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  return {
    selectedSources,
    expandedCategories,
    setExpandedCategories,
    groupedSourcesMap,
    companySources,
    companySourceIds,
    companySourcesTyped,
    companyFilter,
    handleSourceToggle,
    handleSelectAll,
    handleDeselectAll,
    applyPreset,
    handleCategorySelectAll,
    handleCategoryDeselectAll,
    handleCompanyBatchSelect,
    toggleCategory,
    applySourceFilter,
  };
}
