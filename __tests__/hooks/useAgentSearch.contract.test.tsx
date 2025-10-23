import { renderHook } from '@testing-library/react';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import type { UseAgentSearchReturn } from '@/lib/hooks/useAgentSearch';

describe('useAgentSearch Contract', () => {
  test('returns correct interface shape', () => {
    const { result } = renderHook(() => useAgentSearch());
    const hook: UseAgentSearchReturn = result.current;

    expect(hook).toHaveProperty('search');
    expect(hook).toHaveProperty('result');
    expect(hook).toHaveProperty('error');
    expect(hook).toHaveProperty('isLoading');
    expect(hook).toHaveProperty('reset');

    expect(typeof hook.search).toBe('function');
    expect(typeof hook.reset).toBe('function');
    expect(hook.result).toBeNull();
    expect(hook.error).toBeNull();
    expect(hook.isLoading).toBe(false);
  });

  test('search function signature is correct', () => {
    const { result } = renderHook(() => useAgentSearch());

    expect(result.current.search).toBeInstanceOf(Function);
    expect(result.current.search.length).toBe(1); // Accepts 1 parameter (query)
  });

  test('accepts optional callbacks', () => {
    const onSuccess = jest.fn();
    const onError = jest.fn();

    const { result } = renderHook(() =>
      useAgentSearch({
        onSuccess,
        onError,
      })
    );

    expect(result.current).toBeDefined();
  });

  test('reset function initializes state', () => {
    const { result } = renderHook(() => useAgentSearch());

    result.current.reset();

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
