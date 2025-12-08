'use client';

import { useCallback } from 'react';

const STORAGE_KEY = 'searchHistory';
const STORAGE_KEY_V2 = 'searchHistoryV2';
const MAX_HISTORY_ITEMS = 10;

/**
 * Search history item with timestamp
 */
export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export interface UseSearchHistoryReturn {
  /** Get search history as string array (for backward compatibility) */
  getSearchHistory: () => string[];
  /** Get search history with timestamps */
  getSearchHistoryWithTimestamp: () => SearchHistoryItem[];
  /** Save a query to history */
  saveToHistory: (searchQuery: string) => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Get relative time string from timestamp */
  getRelativeTime: (timestamp: number) => string;
}

/**
 * Migrate old format (string[]) to new format (SearchHistoryItem[])
 */
function migrateOldHistory(): SearchHistoryItem[] {
  if (typeof window === 'undefined') return [];

  const oldHistory = localStorage.getItem(STORAGE_KEY);
  if (!oldHistory) return [];

  try {
    const parsed = JSON.parse(oldHistory) as string[];
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      // Old format detected, migrate to new format
      const now = Date.now();
      const migrated: SearchHistoryItem[] = parsed.map((query, index) => ({
        query,
        // Assign decreasing timestamps for migration (oldest first)
        timestamp: now - (parsed.length - index) * 60000,
      }));
      // Save migrated data and remove old key
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
      localStorage.removeItem(STORAGE_KEY);
      return migrated;
    }
  } catch {
    // Invalid data, ignore
  }
  return [];
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const getSearchHistoryWithTimestamp = useCallback((): SearchHistoryItem[] => {
    if (typeof window === 'undefined') return [];

    // Try new format first
    const historyV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (historyV2) {
      try {
        return JSON.parse(historyV2) as SearchHistoryItem[];
      } catch {
        return [];
      }
    }

    // Try migration from old format
    return migrateOldHistory();
  }, []);

  const getSearchHistory = useCallback((): string[] => {
    return getSearchHistoryWithTimestamp().map(item => item.query);
  }, [getSearchHistoryWithTimestamp]);

  const saveToHistory = useCallback((searchQuery: string) => {
    if (typeof window === 'undefined') return;
    if (!searchQuery.trim()) return;

    const history = getSearchHistoryWithTimestamp();
    const newItem: SearchHistoryItem = {
      query: searchQuery,
      timestamp: Date.now(),
    };
    const updatedHistory = [
      newItem,
      ...history.filter(h => h.query !== searchQuery)
    ].slice(0, MAX_HISTORY_ITEMS);

    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(updatedHistory));
  }, [getSearchHistoryWithTimestamp]);

  const clearHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY); // Also clear old format
  }, []);

  const getRelativeTime = useCallback((timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return new Date(timestamp).toLocaleDateString('ja-JP');
  }, []);

  return {
    getSearchHistory,
    getSearchHistoryWithTimestamp,
    saveToHistory,
    clearHistory,
    getRelativeTime,
  };
}
