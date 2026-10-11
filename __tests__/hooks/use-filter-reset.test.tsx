/**
 * useFilterReset: ツールバーと空状態の2か所から押しても、リセットは1回だけ走る（issue #701）
 */
import { act, renderHook } from '@testing-library/react';
import { useFilterReset } from '@/app/hooks/use-filter-reset';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

describe('useFilterReset', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockReplace.mockClear();
  });

  it('実行中の状態を共有し、別の呼び出し元からの実行を重ねない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    global.fetch = jest.fn().mockImplementation(async () => {
      await gate;
      return { ok: true, status: 200 };
    });

    const toolbar = renderHook(() => useFilterReset());
    const emptyState = renderHook(() => useFilterReset());

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = toolbar.result.current.reset();
    });
    expect(toolbar.result.current.isResetting).toBe(true);
    expect(emptyState.result.current.isResetting).toBe(true);

    let second: Promise<void> = Promise.resolve();
    act(() => {
      second = emptyState.result.current.reset();
    });

    await act(async () => {
      release();
      await Promise.all([first, second]);
    });

    // DELETE は2本（フィルター設定・ソースフィルター）を1回分だけ
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(toolbar.result.current.isResetting).toBe(false);
    expect(emptyState.result.current.isResetting).toBe(false);
  });
});
