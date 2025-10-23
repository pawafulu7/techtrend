'use client';

import { useCallback } from 'react';

const STORAGE_KEY = 'searchHistory';
const MAX_HISTORY_ITEMS = 10;

export interface UseSearchHistoryReturn {
  getSearchHistory: () => string[];
  saveToHistory: (searchQuery: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const getSearchHistory = useCallback((): string[] => {
    if (typeof window === 'undefined') return [];

    const history = localStorage.getItem(STORAGE_KEY);
    if (history) {
      try {
        return JSON.parse(history) as string[];
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  const saveToHistory = useCallback((searchQuery: string) => {
    if (typeof window === 'undefined') return;
    if (!searchQuery.trim()) return;

    const history = getSearchHistory();
    const updatedHistory = [
      searchQuery,
      ...history.filter(h => h !== searchQuery)
    ].slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
  }, [getSearchHistory]);

  const clearHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    getSearchHistory,
    saveToHistory,
    clearHistory,
  };
}
