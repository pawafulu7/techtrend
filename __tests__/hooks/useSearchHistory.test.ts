/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useSearchHistory } from '@/lib/hooks/useSearchHistory';

describe('useSearchHistory', () => {
  const STORAGE_KEY = 'searchHistory';
  const STORAGE_KEY_V2 = 'searchHistoryV2';

  beforeEach(() => {
    localStorage.clear();
  });

  describe('getSearchHistory', () => {
    test('returns empty array when no history exists', () => {
      const { result } = renderHook(() => useSearchHistory());
      expect(result.current.getSearchHistory()).toEqual([]);
    });

    test('returns query strings from stored history', () => {
      const historyItems = [
        { query: 'test query 1', timestamp: Date.now() },
        { query: 'test query 2', timestamp: Date.now() - 60000 },
      ];
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(historyItems));

      const { result } = renderHook(() => useSearchHistory());
      expect(result.current.getSearchHistory()).toEqual(['test query 1', 'test query 2']);
    });
  });

  describe('getSearchHistoryWithTimestamp', () => {
    test('returns empty array when no history exists', () => {
      const { result } = renderHook(() => useSearchHistory());
      expect(result.current.getSearchHistoryWithTimestamp()).toEqual([]);
    });

    test('returns full history items with timestamps', () => {
      const historyItems = [
        { query: 'test query 1', timestamp: 1000 },
        { query: 'test query 2', timestamp: 2000 },
      ];
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(historyItems));

      const { result } = renderHook(() => useSearchHistory());
      expect(result.current.getSearchHistoryWithTimestamp()).toEqual(historyItems);
    });

    test('migrates old format to new format', () => {
      const oldHistory = ['old query 1', 'old query 2'];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(oldHistory));

      const { result } = renderHook(() => useSearchHistory());
      const history = result.current.getSearchHistoryWithTimestamp();

      expect(history).toHaveLength(2);
      expect(history[0].query).toBe('old query 1');
      expect(history[1].query).toBe('old query 2');
      expect(typeof history[0].timestamp).toBe('number');

      // Old key should be removed after migration
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      // New key should exist
      expect(localStorage.getItem(STORAGE_KEY_V2)).not.toBeNull();
    });
  });

  describe('saveToHistory', () => {
    test('saves new query to history', () => {
      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        result.current.saveToHistory('new query');
      });

      const history = result.current.getSearchHistoryWithTimestamp();
      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('new query');
      expect(typeof history[0].timestamp).toBe('number');
    });

    test('moves duplicate query to top', () => {
      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        result.current.saveToHistory('query 1');
        result.current.saveToHistory('query 2');
        result.current.saveToHistory('query 1'); // duplicate
      });

      const history = result.current.getSearchHistory();
      expect(history).toEqual(['query 1', 'query 2']);
    });

    test('limits history to 10 items', () => {
      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        for (let i = 0; i < 15; i++) {
          result.current.saveToHistory(`query ${i}`);
        }
      });

      const history = result.current.getSearchHistory();
      expect(history).toHaveLength(10);
      expect(history[0]).toBe('query 14'); // most recent
      expect(history[9]).toBe('query 5'); // oldest kept
    });

    test('does not save empty query', () => {
      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        result.current.saveToHistory('');
        result.current.saveToHistory('   ');
      });

      expect(result.current.getSearchHistory()).toEqual([]);
    });
  });

  describe('clearHistory', () => {
    test('removes all history from storage', () => {
      const historyItems = [
        { query: 'test query', timestamp: Date.now() },
      ];
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(historyItems));

      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        result.current.clearHistory();
      });

      expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
      expect(result.current.getSearchHistory()).toEqual([]);
    });

    test('clears both old and new format keys', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['old']));
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify([{ query: 'new', timestamp: 1 }]));

      const { result } = renderHook(() => useSearchHistory());

      act(() => {
        result.current.clearHistory();
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_V2)).toBeNull();
    });
  });

  describe('getRelativeTime', () => {
    test('returns "たった今" for timestamps less than 1 minute ago', () => {
      const { result } = renderHook(() => useSearchHistory());
      const now = Date.now();

      expect(result.current.getRelativeTime(now)).toBe('たった今');
      expect(result.current.getRelativeTime(now - 30000)).toBe('たった今');
    });

    test('returns minutes for timestamps 1-59 minutes ago', () => {
      const { result } = renderHook(() => useSearchHistory());
      const now = Date.now();

      expect(result.current.getRelativeTime(now - 60000)).toBe('1分前');
      expect(result.current.getRelativeTime(now - 1800000)).toBe('30分前');
      expect(result.current.getRelativeTime(now - 3540000)).toBe('59分前');
    });

    test('returns hours for timestamps 1-23 hours ago', () => {
      const { result } = renderHook(() => useSearchHistory());
      const now = Date.now();

      expect(result.current.getRelativeTime(now - 3600000)).toBe('1時間前');
      expect(result.current.getRelativeTime(now - 43200000)).toBe('12時間前');
      expect(result.current.getRelativeTime(now - 82800000)).toBe('23時間前');
    });

    test('returns days for timestamps 1-6 days ago', () => {
      const { result } = renderHook(() => useSearchHistory());
      const now = Date.now();

      expect(result.current.getRelativeTime(now - 86400000)).toBe('1日前');
      expect(result.current.getRelativeTime(now - 259200000)).toBe('3日前');
      expect(result.current.getRelativeTime(now - 518400000)).toBe('6日前');
    });

    test('returns formatted date for timestamps 7+ days ago', () => {
      const { result } = renderHook(() => useSearchHistory());
      const oldDate = new Date('2024-01-15').getTime();

      const formatted = result.current.getRelativeTime(oldDate);
      expect(formatted).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}$/);
    });
  });
});
