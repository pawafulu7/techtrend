/**
 * usePersonalizationPreferences Hook Tests
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useInterestCategories,
  useUserPreferences,
  useUpdatePreferences,
  usePersonalizationPreferences,
} from '@/lib/hooks/use-personalization-preferences';
import { resetSessionResolvedLatchForTests } from '@/lib/auth/use-session-resolved';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// better-auth の client は ESM のため Jest では実体を読み込ませない。
// 既定は「認証済み」。未認証の挙動を見るテストだけ個別に上書きする。
const mockUseSession = jest.fn(() => ({
  data: { user: { id: 'user-1' } },
  isPending: false,
}));
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

// セッション解決ラッチはモジュールスコープの共有状態なので、テスト間で漏れないよう
// 各テストの前に必ず戻す
beforeEach(() => {
  resetSessionResolvedLatchForTests();
});

// Test wrapper with React Query
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useInterestCategories', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockUseSession.mockClear();
  });

  it('should fetch categories successfully', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: 'Web UI',
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
      {
        id: 'cat-2',
        slug: 'backend',
        name: 'Backend',
        description: 'Server-side',
        icon: 'Server',
        sortOrder: 2,
        isActive: true,
        articleCount: 50,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: mockCategories }),
    });

    const { result } = renderHook(() => useInterestCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCategories);
    expect(mockFetch).toHaveBeenCalledWith('/api/interest-categories');
  });

  it('should handle fetch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useInterestCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe('useUserPreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockUseSession.mockClear();
  });

  it('should fetch user preferences successfully', async () => {
    const mockPreferences = {
      selectedCategories: ['cat-1', 'cat-2'],
      filterEnabled: true,
      periodMonths: 12,
      isAuthenticated: true,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPreferences),
    });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockPreferences);
    expect(mockFetch).toHaveBeenCalledWith('/api/user/preferences/categories?scope=home');
  });

  it('should not call the API when unauthenticated', async () => {
    // 未認証では 401 が確定しているためリクエスト自体を送らない
    mockUseSession.mockReturnValueOnce({ data: null, isPending: false });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    // enabled: false のとき isLoading は false（呼び出し側の記事クエリを止めない）
    expect(result.current.isLoading).toBe(false);
  });

  it('should not call the API while the session is still pending', async () => {
    mockUseSession.mockReturnValueOnce({ data: null, isPending: true });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe('idle');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return default preferences when the API returns 401 (expired session)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      selectedCategories: [],
      filterEnabled: false,
      periodMonths: 12,
      isAuthenticated: false,
    });
  });
});

describe('useUpdatePreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockUseSession.mockClear();
  });

  it('should update preferences successfully', async () => {
    const mockResponse = {
      success: true,
      selectedCategories: ['cat-1', 'cat-2'],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useUpdatePreferences(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      categoryIds: ['cat-1', 'cat-2'],
      filterEnabled: true,
      periodMonths: 12,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/user/preferences/categories',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryIds: ['cat-1', 'cat-2'],
          filterEnabled: true,
          periodMonths: 12,
          scope: 'home',
        }),
      })
    );
  });

  it('should handle update error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid category IDs' }),
    });

    const { result } = renderHook(() => useUpdatePreferences(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      categoryIds: ['invalid-id'],
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Invalid category IDs');
  });
});

describe('usePersonalizationPreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockUseSession.mockClear();
  });

  it('should combine categories and preferences', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: null,
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
    ];

    const mockPreferences = {
      selectedCategories: ['cat-1'],
      filterEnabled: true,
      periodMonths: 6,
      isAuthenticated: true,
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreferences),
      });

    const { result } = renderHook(() => usePersonalizationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.selectedCategories).toEqual(['cat-1']);
    expect(result.current.filterEnabled).toBe(true);
    expect(result.current.periodMonths).toBe(6);
    expect(result.current.hasPreferences).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should return defaults when no preferences', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: null,
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

    const { result } = renderHook(() => usePersonalizationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.selectedCategories).toEqual([]);
    expect(result.current.filterEnabled).toBe(false);
    expect(result.current.periodMonths).toBe(12);
    expect(result.current.hasPreferences).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('Scope separation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should use independent cache keys for home and digest scopes', async () => {
    // Track which URLs were fetched
    const fetchedUrls: string[] = [];
    mockFetch.mockImplementation(async (url: string) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            selectedCategories: url.includes('scope=digest')
              ? ['cat-2', 'cat-3']
              : ['cat-1'],
            filterEnabled: true,
            periodMonths: 12,
          }),
      };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Render home scope
    const { result: homeResult } = renderHook(
      () => useUserPreferences('home'),
      { wrapper }
    );

    await waitFor(() => {
      expect(homeResult.current.isSuccess).toBe(true);
    });

    // Render digest scope in same QueryClient (ensures separate cache entries)
    const { result: digestResult } = renderHook(
      () => useUserPreferences('digest'),
      { wrapper }
    );

    await waitFor(() => {
      expect(digestResult.current.isSuccess).toBe(true);
    });

    // Both scopes should have been fetched independently
    expect(fetchedUrls).toContain(
      '/api/user/preferences/categories?scope=home'
    );
    expect(fetchedUrls).toContain(
      '/api/user/preferences/categories?scope=digest'
    );
  });

  it('should invalidate infinite-articles on home scope update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ success: true, selectedCategories: ['cat-1'] }),
    }));

    const { result } = renderHook(() => useUpdatePreferences('home'), {
      wrapper,
    });

    result.current.mutate({
      categoryIds: ['cat-1'],
      filterEnabled: true,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify fetch was called with scope in body
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/user/preferences/categories',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"scope":"home"'),
      })
    );

    // infinite-articles should be invalidated for home scope
    const infiniteArticlesCalls = invalidateSpy.mock.calls.filter(
      (call: any[]) => call[0]?.queryKey?.[0] === 'infinite-articles'
    );
    expect(infiniteArticlesCalls.length).toBeGreaterThanOrEqual(1);

    invalidateSpy.mockRestore();
  });

  it('should not invalidate infinite-articles on digest scope update', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ success: true, selectedCategories: ['cat-2'] }),
    }));

    const { result } = renderHook(() => useUpdatePreferences('digest'), {
      wrapper,
    });

    result.current.mutate({
      categoryIds: ['cat-2'],
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // infinite-articles should NOT be invalidated for digest scope
    const infiniteArticlesCalls = invalidateSpy.mock.calls.filter(
      (call: any[]) => call[0]?.queryKey?.[0] === 'infinite-articles'
    );
    expect(infiniteArticlesCalls).toHaveLength(0);

    invalidateSpy.mockRestore();
  });
});

/**
 * isLoadingPreferences は 2 つの項の OR で構成されており、ラッチの掛け方を
 * 間違えると症状が正反対の 2 種類の回帰になる。
 *  - isSessionPending をラッチしない → タブ復帰ごとに記事クエリの enabled が
 *    false→true へ再遷移し、読み込み済み全ページの再取得とスクロール位置喪失
 *  - preferencesQuery.isLoading までラッチする → principal 変更時に設定の解決を
 *    待たずに記事クエリが走り、Issue #569（空状態のフラッシュ）が別条件で再発
 * 両方向を固定する。
 */
describe('usePersonalizationPreferences のローディング判定ラッチ', () => {
  const sessionOf = (userId: string, isPending = false) => ({
    data: { user: { id: userId } },
    isPending,
  });

  const CATEGORIES_URL = '/api/interest-categories';
  const PREFERENCES_URL = '/api/user/preferences/categories';

  beforeEach(() => {
    mockFetch.mockReset();
    mockUseSession.mockImplementation(() => sessionOf('user-1'));
  });

  afterEach(() => {
    // 既定（認証済み・解決済み）へ戻し、後続テストへ状態を漏らさない
    mockUseSession.mockImplementation(() => sessionOf('user-1'));
  });

  it('セッション解決後に isPending が true へ戻っても isLoadingPreferences は false のまま（タブ復帰で全ページ再取得される回帰を防ぐ）', async () => {
    // better-auth はタブ復帰時の再検証で isPending を true へ戻す。その揺れを
    // そのまま公開すると呼び出し側（home-client-infinite の enabled)が
    // false→true に再遷移し、一覧 DOM の破棄とスクロール位置喪失を招く。
    mockFetch.mockImplementation(async (url: string) => {
      if (url === CATEGORIES_URL) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ categories: [] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            selectedCategories: ['cat-1'],
            filterEnabled: true,
            periodMonths: 12,
          }),
      };
    });

    const { result, rerender } = renderHook(
      () => usePersonalizationPreferences(),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });

    // 再検証で isPending が true へ戻る
    mockUseSession.mockImplementation(() => sessionOf('user-1', true));
    rerender();

    expect(result.current.isLoadingPreferences).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.isLoadingPreferences).toBe(false);
    expect(result.current.selectedCategories).toEqual(['cat-1']);
  });

  it('セッション解決後に新しくマウントしたインスタンスは、isPending が true でも isLoadingPreferences が false のまま（記事詳細 → ホームの再マウントで全ページ再取得される回帰を防ぐ）', async () => {
    // ラッチをフックインスタンス単位で持つと、新インスタンスは必ず未解決から
    // 始まるため再マウント経路でラッチが効かない。記事詳細からホームへ戻った
    // ときに better-auth の online / broadcast 由来の session fetch が in-flight
    // だと、enabled が false→true に再遷移して読み込み済み全ページが再取得される。
    mockFetch.mockImplementation(async (url: string) => {
      if (url === CATEGORIES_URL) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ categories: [] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            selectedCategories: ['cat-1'],
            filterEnabled: true,
            periodMonths: 12,
          }),
      };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // 1 つ目のインスタンス（ホーム）でセッションが解決する
    const first = renderHook(() => usePersonalizationPreferences(), {
      wrapper,
    });
    await waitFor(() => {
      expect(first.result.current.isLoadingPreferences).toBe(false);
    });
    // 記事詳細へ遷移してホームがアンマウントされる
    first.unmount();

    // ホームへ戻る瞬間に session fetch が in-flight（isPending: true）
    mockUseSession.mockImplementation(() => sessionOf('user-1', true));
    const second = renderHook(() => usePersonalizationPreferences(), {
      wrapper,
    });

    // 初回レンダーから false であること（true から始まると enabled が振れる）
    expect(second.result.current.isLoadingPreferences).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(second.result.current.isLoadingPreferences).toBe(false);
  });

  it('principal が変わって preferences 取得中になったら isLoadingPreferences が true になる（preferencesQuery.isLoading をラッチしないことの保証 / Issue #569 の別条件再発防止）', async () => {
    // ラッチは isSessionPending の項だけに掛かっていなければならない。
    // preferencesQuery.isLoading までラッチすると、ユーザー切り替え後に
    // 前ユーザーの設定で記事クエリが走り、直後に再フェッチ（空状態のフラッシュ）になる。
    let releaseSecondPreferences: (() => void) | undefined;
    let preferenceCallCount = 0;

    mockFetch.mockImplementation(async (url: string) => {
      if (url === CATEGORIES_URL) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ categories: [] }),
        };
      }
      if (url.startsWith(PREFERENCES_URL)) {
        preferenceCallCount += 1;
        if (preferenceCallCount === 1) {
          return {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                selectedCategories: ['cat-1'],
                filterEnabled: true,
                periodMonths: 12,
              }),
          };
        }
        // 2 人目の設定取得は明示的に解放するまで pending のままにし、
        // 「取得中」の窓を確実に観測できるようにする
        return new Promise((resolve) => {
          releaseSecondPreferences = () =>
            resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  selectedCategories: ['cat-9'],
                  filterEnabled: true,
                  periodMonths: 12,
                }),
            });
        });
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    });

    const { result, rerender } = renderHook(
      () => usePersonalizationPreferences(),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });
    expect(result.current.selectedCategories).toEqual(['cat-1']);

    // principal 変更（queryKey の userId が変わり、新しい設定の取得が始まる）
    mockUseSession.mockImplementation(() => sessionOf('user-2'));
    rerender();

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(true);
    });

    await act(async () => {
      releaseSecondPreferences?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(result.current.isLoadingPreferences).toBe(false);
    });
    expect(result.current.selectedCategories).toEqual(['cat-9']);
  });
});
