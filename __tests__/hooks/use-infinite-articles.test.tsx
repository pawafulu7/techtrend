/**
 * useInfiniteArticles Hook Tests
 *
 * 記事カードが詳細へのリンクに付ける `returning` は「詳細から戻ってきた」ことを示す
 * UI 用フラグで取得結果には影響しない。これが queryKey / API クエリに混ざると
 * 一覧へ戻るたびに別クエリ扱いになり 1 ページ目から取り直しになる（＝読み込み済みの
 * ページとスクロール位置が失われる）。normalizedFilters 構築時の除外を単一の除外点と
 * しているため、その除外が外れたことを検出できるテストをここに置く。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useInfiniteArticles } from '@/app/hooks/use-infinite-articles';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const PAGE_1_RESPONSE = {
  data: { items: [], total: 1, page: 1, totalPages: 1, limit: 20 },
};

function createTestQueryClient() {
  // gcTime / staleTime / refetchOnMount はフック側の指定を検証対象にするため既定では触らない
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

/** 記事一覧 API（/api/articles, /api/articles/list）への呼び出し URL を抽出 */
function articleListUrls(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => url)
    .filter(
      (url): url is string =>
        typeof url === 'string' && url.startsWith('/api/articles')
    );
}

function infiniteArticlesQueryKeys(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ['infinite-articles'] })
    .map((query) => query.queryKey);
}

/** マイクロタスク + マクロタスクを 1 巡させ、遅延発火する refetch を取りこぼさない */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useInfiniteArticles', () => {
  beforeEach(() => {
    // jest.setup.dom.js の clearAllMocks は実装を消さないため、実装もここで固定する
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAGE_1_RESPONSE),
    });
  });

  it('returning の有無で queryKey が同一になる（詳細から戻るたびに1ページ目から取り直す回帰を防ぐ）', async () => {
    // returning が queryKey に混ざると別クエリ扱いになり、読み込み済みページと
    // スクロール位置が失われる。同一 QueryClient 上でキャッシュエントリが
    // 1 つに収まることで「同じクエリ」であることを検証する。
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result: withoutReturning } = renderHook(
      () => useInfiniteArticles({ sourceId: 'source-1' }),
      { wrapper }
    );
    await waitFor(() => {
      expect(withoutReturning.current.isSuccess).toBe(true);
    });

    const { result: withReturning } = renderHook(
      () => useInfiniteArticles({ sourceId: 'source-1', returning: 'true' }),
      { wrapper }
    );
    await waitFor(() => {
      expect(withReturning.current.isSuccess).toBe(true);
    });

    const keys = infiniteArticlesQueryKeys(queryClient);
    expect(keys).toHaveLength(1);
    expect(JSON.stringify(keys[0])).not.toContain('returning');
  });

  it('returning が API のリクエストパラメータに含まれない（サーバー側の未知パラメータ/キャッシュ分裂を防ぐ）', async () => {
    // normalizedFilters が searchParams の唯一の供給元なので、除外が外れると
    // queryKey と同時に API クエリ文字列も汚染される。
    renderHook(
      () => useInfiniteArticles({ sourceId: 'source-1', returning: 'true' }),
      { wrapper: createWrapper(createTestQueryClient()) }
    );

    await waitFor(() => {
      expect(articleListUrls()).toHaveLength(1);
    });
    expect(articleListUrls()[0]).toContain('sourceId=source-1');
    expect(articleListUrls()[0]).not.toContain('returning');
  });

  it('returning 付きでマウントしても即座に再取得しない（returning による staleTime/refetchOnMount 分岐撤去の回帰を防ぐ）', async () => {
    // 実際の導線（一覧 → 詳細 → returning 付きで一覧へ戻る）を再現する。
    // 修正前は returning があると staleTime: 0 / refetchOnMount: 'always' になり、
    // 戻るたびに全ページが取り直されていた。
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);

    const { unmount } = renderHook(
      () => useInfiniteArticles({ sourceId: 'source-1' }),
      { wrapper }
    );
    await waitFor(() => {
      expect(articleListUrls()).toHaveLength(1);
    });
    unmount();

    // 詳細から戻ってきた想定: 同じフィルタ + returning
    const { result } = renderHook(
      () => useInfiniteArticles({ sourceId: 'source-1', returning: 'true' }),
      { wrapper }
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    await flush();

    // キャッシュから復元され、追加の fetch は発生しない
    expect(articleListUrls()).toHaveLength(1);
    expect(result.current.isFetching).toBe(false);
  });
});
