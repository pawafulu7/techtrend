/**
 * お気に入りソースの並べ替え: 複製に対して並べ替え、state を書き換えない（Issue #700 の PR のレビューで発見）
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useFavoriteSources } from '@/lib/favorites/hooks';

const source = (id: string, order: number) => ({
  id,
  sourceId: `src-${id}`,
  addedAt: '2026-10-01T00:00:00.000Z',
  notifications: { enabled: false, frequency: 'all' },
  order,
});

describe('useFavoriteSources: 並べ替え', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'techtrend-favorite-sources',
      JSON.stringify([source('b', 2), source('a', 1), source('c', 3)])
    );
  });

  it('order の順に並べて返す', async () => {
    const { result } = renderHook(() => useFavoriteSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.favorites.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('再描画しても、元が変わらなければ同じ配列を返す（依存に持つ処理を毎回走らせない）', async () => {
    const { result, rerender } = renderHook(() => useFavoriteSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.favorites;
    rerender();
    expect(result.current.favorites).toBe(first);
  });
});
