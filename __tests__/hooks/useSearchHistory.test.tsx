import { renderHook, act } from '@testing-library/react';
import { useSearchHistory } from '@/lib/hooks/useSearchHistory';

describe('useSearchHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('returns empty array when no history exists', () => {
    const { result } = renderHook(() => useSearchHistory());

    const history = result.current.getSearchHistory();
    expect(history).toEqual([]);
  });

  test('saves query to history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.saveToHistory('test query');
    });

    const history = result.current.getSearchHistory();
    expect(history).toEqual(['test query']);
  });

  test('maintains max 10 items in history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      for (let i = 1; i <= 15; i++) {
        result.current.saveToHistory(`query ${i}`);
      }
    });

    const history = result.current.getSearchHistory();
    expect(history).toHaveLength(10);
    expect(history[0]).toBe('query 15'); // Most recent first
    expect(history[9]).toBe('query 6'); // Oldest kept
  });

  test('moves existing query to top when saved again', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.saveToHistory('query 1');
      result.current.saveToHistory('query 2');
      result.current.saveToHistory('query 3');
    });

    let history = result.current.getSearchHistory();
    expect(history).toEqual(['query 3', 'query 2', 'query 1']);

    act(() => {
      result.current.saveToHistory('query 1'); // Re-save query 1
    });

    history = result.current.getSearchHistory();
    expect(history).toEqual(['query 1', 'query 3', 'query 2']); // query 1 moved to top
  });

  test('does not save empty or whitespace-only queries', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.saveToHistory('');
      result.current.saveToHistory('   ');
      result.current.saveToHistory('\t\n');
    });

    const history = result.current.getSearchHistory();
    expect(history).toEqual([]);
  });

  test('clears all history', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.saveToHistory('query 1');
      result.current.saveToHistory('query 2');
    });

    let history = result.current.getSearchHistory();
    expect(history).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    history = result.current.getSearchHistory();
    expect(history).toEqual([]);
  });

  test('handles corrupted localStorage data gracefully', () => {
    localStorage.setItem('searchHistory', 'invalid json{');

    const { result } = renderHook(() => useSearchHistory());

    const history = result.current.getSearchHistory();
    expect(history).toEqual([]); // Falls back to empty array
  });

  test('works in SSR environment (typeof window === undefined)', () => {
    const originalWindow = global.window;

    delete (global as any).window;

    const { result } = renderHook(() => useSearchHistory());

    const history = result.current.getSearchHistory();
    expect(history).toEqual([]);

    act(() => {
      result.current.saveToHistory('test');
    });

    act(() => {
      result.current.clearHistory();
    });

    (global as any).window = originalWindow;
  });

  test('removes specific history item by timestamp', () => {
    const { result } = renderHook(() => useSearchHistory());

    // Manually set up history with known timestamps
    const testHistory = [
      { query: 'query 3', timestamp: 3000 },
      { query: 'query 2', timestamp: 2000 },
      { query: 'query 1', timestamp: 1000 },
    ];
    localStorage.setItem('searchHistoryV2', JSON.stringify(testHistory));

    let history = result.current.getSearchHistory();
    expect(history).toEqual(['query 3', 'query 2', 'query 1']);

    act(() => {
      result.current.removeFromHistory(1000); // Remove query 1
    });

    history = result.current.getSearchHistory();
    expect(history).toEqual(['query 3', 'query 2']); // query 1 removed
  });

  test('removeFromHistory returns updated history', () => {
    const { result } = renderHook(() => useSearchHistory());

    // Manually set up history with known timestamps
    const testHistory = [
      { query: 'query 2', timestamp: 2000 },
      { query: 'query 1', timestamp: 1000 },
    ];
    localStorage.setItem('searchHistoryV2', JSON.stringify(testHistory));

    let updatedHistory: ReturnType<typeof result.current.getSearchHistoryWithTimestamp> = [];
    act(() => {
      updatedHistory = result.current.removeFromHistory(2000); // Remove query 2
    });

    expect(updatedHistory).toHaveLength(1);
    expect(updatedHistory[0].query).toBe('query 1');
  });

  test('removeFromHistory does nothing if timestamp not found', () => {
    const { result } = renderHook(() => useSearchHistory());

    act(() => {
      result.current.saveToHistory('query 1');
      result.current.saveToHistory('query 2');
    });

    const historyBefore = result.current.getSearchHistory();
    expect(historyBefore).toHaveLength(2);

    act(() => {
      result.current.removeFromHistory(999999999999); // Non-existent timestamp
    });

    const historyAfter = result.current.getSearchHistory();
    expect(historyAfter).toEqual(historyBefore);
  });
});
