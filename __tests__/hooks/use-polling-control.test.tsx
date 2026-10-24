import { act, renderHook } from '@testing-library/react';
import { usePollingControl } from '@/lib/hooks/use-polling-control';

describe('usePollingControl', () => {
  it('動いている状態で始まり、指定した間隔を返す', () => {
    const { result } = renderHook(() => usePollingControl(15000));

    expect(result.current.isActive).toBe(true);
    expect(result.current.interval).toBe(15000);
  });

  it('手動で止め、再開できる', () => {
    const { result } = renderHook(() => usePollingControl());

    act(() => result.current.pause());
    expect(result.current.isActive).toBe(false);

    act(() => result.current.resume());
    expect(result.current.isActive).toBe(true);
  });

  it('手動で止めた後は、タブを戻しても再開しない', () => {
    const { result } = renderHook(() => usePollingControl());

    act(() => result.current.pause());
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isActive).toBe(false);
  });
});
