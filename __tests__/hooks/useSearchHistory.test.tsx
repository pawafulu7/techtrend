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
});
