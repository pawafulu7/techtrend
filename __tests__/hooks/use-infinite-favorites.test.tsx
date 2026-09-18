/**
 * useInfiniteFavorites Hook Tests
 *
 * このフックの利用者は app/favorites/_components/favorites-content.tsx のみで、
 * /favorites が未マウントの間はフック内の window イベントリスナー（お気に入り追加・
 * 削除の同期）が一切動かない。そのため「マウント時に取り直す」経路を塞ぐと、
 * 他画面で行った変更が最大 gcTime（30 分）反映されないまま一覧が表示される。
 * ブランチ fix/forced-refetch-on-tab-return で一度この状態を作ってしまったため、
 * 外形（stale 化 → 再マウントで再取得される）をここで固定する。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useInfiniteFavorites } from '@/app/hooks/use-infinite-favorites';

const FAVORITES_URL = '/api/favorites';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const PAGE_1_RESPONSE = {
  favorites: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

function createTestQueryClient() {
  // staleTime / gcTime / refetchOn* はフック側の指定を検証対象にするため既定では触らない
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/** お気に入り API への呼び出し URL を抽出 */
function favoritesUrls(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => url)
    .filter(
      (url): url is string =>
        typeof url === 'string' && url.startsWith(FAVORITES_URL)
    );
}

function favoritesQuery(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ['infinite-favorites'] })[0];
}

/** マイクロタスク + マクロタスクを 1 巡させ、遅延発火する refetch を取りこぼさない */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useInfiniteFavorites', () => {
  beforeEach(() => {
    // jest.setup.dom.js の clearAllMocks は実装を消さないため、実装もここで固定する
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAGE_1_RESPONSE),
    });
  });

  it('refetchOnMount を false にしない（/favorites 未マウント中のお気に入り変更が反映されない回帰を防ぐ）', async () => {
    // 実際の導線を再現する:
    //   /favorites を開く → 離れる → ホームや記事詳細でお気に入りを追加・削除
    //   （app/providers/query-provider.tsx が refetchType: 'none' で stale 化する）
    //   → /favorites へ戻る
    // refetchOnMount: false だと最後の再マウントで取り直されず、追加した記事が
    // 一覧に出ない（削除した記事も残る）状態が gcTime の間続く。
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);

    const { unmount } = renderHook(() => useInfiniteFavorites(), { wrapper });
    await waitFor(() => {
      expect(favoritesUrls()).toHaveLength(1);
    });
    unmount();

    // 未マウント中に他画面でお気に入りが変わった（provider による stale マーク）。
    // 表示中のクエリは再取得しない指定なので、ここでは fetch は起きない。
    act(() => {
      queryClient.invalidateQueries({
        queryKey: ['infinite-favorites'],
        refetchType: 'none',
      });
    });
    await flush();
    expect(favoritesUrls()).toHaveLength(1);

    // /favorites へ戻る（再マウント）
    const { result } = renderHook(() => useInfiniteFavorites(), { wrapper });
    await waitFor(() => {
      expect(favoritesUrls()).toHaveLength(2);
    });
    expect(result.current.isSuccess).toBe(true);

    // 併せて設定そのものも固定する（既定 true のまま = 明示的な false を禁止）
    expect(favoritesQuery(queryClient).options.refetchOnMount).not.toBe(false);
  });

  it('refetchOnReconnect をフック側で false 指定している（online イベントで全ページが取り直される回帰を防ぐ）', async () => {
    // 未設定だと networkMode !== 'always' により既定 true になり、スリープ復帰や
    // WiFi 再接続で読み込み済み全ページが 1 ページ目から取り直される。
    // グローバル既定ではなくフック側で指定するのは、グローバルに置くと fetch 失敗後の
    // クエリがネットワーク復帰で自動復帰しなくなる副作用が全クエリに及ぶため。
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useInfiniteFavorites(), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const query = favoritesQuery(queryClient);
    expect(query).toBeDefined();
    expect(query.options.refetchOnReconnect).toBe(false);
  });
});
