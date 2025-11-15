import { useState, useMemo, useCallback } from 'react';
import { useDebounce } from './use-debounce';
import type { CompanySource } from '@/lib/providers/company-source';

const MAX_SIDEBAR_ITEMS = 7;
const SEARCH_DEBOUNCE_MS = 300;

export interface UseCompanyFilterOptions {
  sources: CompanySource[];
  initialSelected: string[];
}

export interface UseCompanyFilterReturn {
  sources: CompanySource[];
  selected: string[];
  setSelected: (sourceIds: string[]) => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
  visibleSidebarSources: CompanySource[];
  visibleModalSources: CompanySource[];
  toggleSource: (sourceId: string) => void;
  selectAll: () => void;
  clearAll: () => void;
}

/**
 * Company filter hook
 * Manages selection state and filtering for company blog sources
 */
export function useCompanyFilter({
  sources,
  initialSelected,
}: UseCompanyFilterOptions): UseCompanyFilterReturn {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [searchValue, setSearchValue] = useState('');

  // Note: selected state is initialized once from initialSelected.
  // If parent needs to sync external changes (e.g., URL params),
  // consider adding:
  // useEffect(() => { setSelected(initialSelected); }, [initialSelected]);
  // Phase 2: Evaluate if bidirectional sync is needed.

  // Debounce search to avoid re-rendering on every keystroke
  const debouncedSearch = useDebounce(searchValue, SEARCH_DEBOUNCE_MS);

  // Filter sources based on search query
  const filteredSources = useMemo(() => {
    if (!debouncedSearch) return sources;

    const query = debouncedSearch.toLowerCase();
    return sources.filter((source) =>
      source.name.toLowerCase().includes(query)
    );
  }, [sources, debouncedSearch]);

  // Sort sources alphabetically
  const sortedSources = useMemo(() => {
    return [...filteredSources].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredSources]);

  // Sidebar sources (max 7 items)
  const visibleSidebarSources = useMemo(() => {
    return sortedSources.slice(0, MAX_SIDEBAR_ITEMS);
  }, [sortedSources]);

  // Modal sources (all items)
  const visibleModalSources = useMemo(() => {
    return sortedSources;
  }, [sortedSources]);

  // Toggle source selection (memoized to prevent cascading re-renders)
  const toggleSource = useCallback((sourceId: string) => {
    setSelected((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  }, []);

  // Select all sources (memoized)
  const selectAll = useCallback(() => {
    setSelected(sources.map((s) => s.id));
  }, [sources]);

  // Clear all selections (memoized)
  const clearAll = useCallback(() => {
    setSelected([]);
  }, []);

  return {
    sources,
    selected,
    setSelected,
    searchValue,
    setSearchValue,
    visibleSidebarSources,
    visibleModalSources,
    toggleSource,
    selectAll,
    clearAll,
  };
}
