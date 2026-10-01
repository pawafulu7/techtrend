import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/app/providers/query-provider';
import {
  FAVORITE_STATUSES_QUERY_KEY,
  useFavoriteStatuses,
} from '@/app/hooks/use-favorite-statuses';

/**
 * 一覧画面のお気に入り状態のバッチ取得（issue #653）
 *
 * QueryProvider は実物を使う。トグル後の同期（article-favorite-changed で
 * このクエリを書き換える処理）が provider 側にあるため。
 */

type SessionState = {
  data: { user: { id: string } } | null;
  isPending: boolean;
};

const mockUseSession = jest.fn(
  (): SessionState => ({ data: { user: { id: 'user-1' } }, isPending: false })
);
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryProvider>{children}</QueryProvider>
);

const fetchMock = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// 要求された ID をすべて favoritedIds に含まれるかで答える batch API のモック
function respondWith(favoritedIds: string[]) {
  return async (_url: string, init: RequestInit) => {
    const { articleIds } = JSON.parse(String(init.body)) as {
      articleIds: string[];
    };
    return jsonResponse({
      favorites: Object.fromEntries(
        articleIds.map((id) => [id, favoritedIds.includes(id)])
      ),
    });
  };
}

function requestedIds(callIndex: number): string[] {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return (JSON.parse(String(init.body)) as { articleIds: string[] })
    .articleIds;
}

// 既定はログイン中のユーザー（user-1）のトグル。null で userId なしのイベント
function dispatchFavoriteChanged(
  articleId: string,
  isFavorited: boolean,
  userId: string | null = 'user-1'
) {
  window.dispatchEvent(
    new CustomEvent('article-favorite-changed', {
      detail: {
        articleId,
        isFavorited,
        timestamp: Date.now(),
        ...(userId === null ? {} : { userId }),
      },
    })
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
  mockUseSession.mockReturnValue({
    data: { user: { id: 'user-1' } },
    isPending: false,
  });
});

describe('useFavoriteStatuses', () => {
  it('重複を除いてソートした ID で batch API を 1 回呼び、結果を返す', async () => {
    fetchMock.mockImplementation(respondWith(['a']));

    const { result } = renderHook(
      () => useFavoriteStatuses(['b', 'a', 'b', 'c']),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/favorites/batch');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(requestedIds(0)).toEqual(['a', 'b', 'c']);
    expect(result.current.statuses).toEqual({ a: true, b: false, c: false });
    expect(result.current.isError).toBe(false);
  });

  it('101 件以上は 100 件ずつに分けて呼び、結果をまとめる', async () => {
    fetchMock.mockImplementation(respondWith(['id-000', 'id-149']));
    const ids = Array.from(
      { length: 150 },
      (_, i) => `id-${String(i).padStart(3, '0')}`
    );

    const { result } = renderHook(() => useFavoriteStatuses(ids), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestedIds(0)).toHaveLength(100);
    expect(requestedIds(1)).toHaveLength(50);
    expect(Object.keys(result.current.statuses)).toHaveLength(150);
    expect(result.current.statuses['id-000']).toBe(true);
    expect(result.current.statuses['id-149']).toBe(true);
    expect(result.current.statuses['id-100']).toBe(false);
  });

  it('未ログインでは取得しない', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });

    // 取得しないので読み込み中にもならない（ボタンはログイン誘導として動く）
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.statuses).toEqual({});
  });

  it('セッション確定前は取得せず取得中の表示にし、確定したら取得する', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    fetchMock.mockImplementation(respondWith(['a']));

    const { result, rerender } = renderHook(
      () => useFavoriteStatuses(['a']),
      { wrapper }
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // 旧実装（カードの個別取得）と同じく、確定前から取得中の表示にする
    expect(result.current.isLoading).toBe(true);

    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
    rerender();

    await waitFor(() => expect(result.current.statuses).toEqual({ a: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('記事が無ければ取得しない', async () => {
    const { result } = renderHook(() => useFavoriteStatuses([]), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('API が失敗したら isError にする（カード側の個別取得に戻すため）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'x' }, 500));

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });

    // 5xx は 1 秒後に 1 回だけ再試行する
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 4000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.statuses).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('4xx は再試行せずにすぐ isError にする', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'x' }, 403));

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('応答に要求した ID が欠けていたら isError にする（未取得を「未登録」と見せない）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ favorites: { a: true } }));

    const { result } = renderHook(() => useFavoriteStatuses(['a', 'b']), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 4000,
    });
  });

  it('article-favorite-changed で取得済みの状態を書き換える', async () => {
    fetchMock.mockImplementation(respondWith(['a']));

    const { result } = renderHook(() => useFavoriteStatuses(['a', 'b']), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.statuses).toEqual({ a: true, b: false })
    );

    act(() => {
      dispatchFavoriteChanged('b', true);
      dispatchFavoriteChanged('a', false);
    });

    await waitFor(() =>
      expect(result.current.statuses).toEqual({ a: false, b: true })
    );
    // 書き換えだけで完結し、取り直さない
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('取得中にトグルされても、遅れて届いたトグル前の応答で巻き戻らない', async () => {
    // 1 回目: トグル前のサーバー状態（a は登録済み）を、トグルの後に返す
    let resolveFirst: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    // 2 回目以降: トグル後のサーバー状態（a は未登録）
    fetchMock.mockImplementation(respondWith([]));

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // 取得中に a のお気に入りを解除した
    await act(async () => {
      dispatchFavoriteChanged('a', false);
    });

    // 古い応答が遅れて届く
    await act(async () => {
      resolveFirst(jsonResponse({ favorites: { a: true } }));
    });

    // 取り消した取得の代わりに取り直し、トグル後の状態になる
    await waitFor(() => expect(result.current.statuses).toEqual({ a: false }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLoading).toBe(false);
  });

  it('トグルした記事を含まないバッチは取り消さない', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      dispatchFavoriteChanged('other', true);
    });
    await act(async () => {
      resolveFirst(jsonResponse({ favorites: { a: true } }));
    });

    await waitFor(() => expect(result.current.statuses).toEqual({ a: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('トグルした記事を含まないクエリは書き換えない（最新扱いにしない）', async () => {
    fetchMock.mockImplementation(respondWith(['a']));

    const { result } = renderHook(
      () => ({
        withA: useFavoriteStatuses(['a']),
        withoutA: useFavoriteStatuses(['b']),
        client: useQueryClient(),
      }),
      { wrapper }
    );
    await waitFor(() => {
      expect(result.current.withA.statuses).toEqual({ a: true });
      expect(result.current.withoutA.statuses).toEqual({ b: false });
    });
    const keyWithoutA = [...FAVORITE_STATUSES_QUERY_KEY, 'user-1', ['b']];
    const updatedAtBefore =
      result.current.client.getQueryState(keyWithoutA)?.dataUpdatedAt;

    await act(async () => {
      dispatchFavoriteChanged('a', false);
    });

    await waitFor(() =>
      expect(result.current.withA.statuses).toEqual({ a: false })
    );
    expect(
      result.current.client.getQueryState(keyWithoutA)?.dataUpdatedAt
    ).toBe(updatedAtBefore);
  });

  it('別のユーザーや誰のものか分からないトグル完了は反映しない（ログアウト → 別ユーザーでログインした後）', async () => {
    fetchMock.mockImplementation(respondWith(['a']));

    const { result } = renderHook(() => useFavoriteStatuses(['a']), {
      wrapper,
    });
    await waitFor(() => expect(result.current.statuses).toEqual({ a: true }));

    await act(async () => {
      dispatchFavoriteChanged('a', false, 'previous-user');
      // 誰のトグルか分からないイベントも、ユーザーごとのキャッシュには反映しない
      dispatchFavoriteChanged('a', false, null);
    });
    // 同期処理は cancelQueries を待ってから書き換えるので、マクロタスク 1 回分
    // 待ってから「書き換わっていない」ことを確かめる
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.statuses).toEqual({ a: true });

    await act(async () => {
      dispatchFavoriteChanged('a', false, 'user-1');
    });
    await waitFor(() => expect(result.current.statuses).toEqual({ a: false }));
  });
});
