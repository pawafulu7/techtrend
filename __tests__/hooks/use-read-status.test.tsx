/**
 * useReadStatus Hook Tests
 *
 * このフックは localStorage 由来の initialData（unreadCount: 0）を持つため、
 * キャッシュ鮮度の設定を 1 つ壊すだけでサーバーへ到達しなくなり、unreadCount が
 * 0 に固定される。その状態では app/components/common/mark-all-read-button.tsx の
 * `disabled={disabled || isMarking || unreadCount === 0}` により一括既読ボタンが
 * 常時無効化され、UI 上はエラーも出ないまま機能だけが静かに死ぬ。
 * 呼び出し元は app/components/common/mark-all-read-wrapper.tsx のみで他に検出手段が
 * ないため、ここで外形（fetch が飛ぶ・unreadCount が反映される）を固定する。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useReadStatus } from '@/app/hooks/use-read-status';

const READ_STATUS_URL = '/api/articles/read-status';
const STORAGE_KEY_PREFIX = 'techtrend-read-articles';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// better-auth の client は ESM のため Jest では実体を読み込ませない。
// 既定は「認証済み・セッション解決済み」。各テストで必要に応じて上書きする。
const mockUseSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

function createTestQueryClient() {
  // staleTime / refetchOnMount はフック側で明示指定されているため既定値では上書きしない
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

/** GET /api/articles/read-status の呼び出しのみを抽出（mutation 系の POST/PUT/DELETE を除く） */
function readStatusGetCalls() {
  return mockFetch.mock.calls.filter(
    ([url, init]) =>
      typeof url === 'string' &&
      url.startsWith(READ_STATUS_URL) &&
      (!init || init.method === undefined)
  );
}

function readStatusQueryKeys(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ['read-status'] })
    .map((query) => JSON.stringify(query.queryKey));
}

/** マイクロタスク + マクロタスクを 1 巡させ、遅延発火する refetch を取りこぼさない */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockServerReadStatus(readArticleIds: string[], unreadCount: number) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ readArticleIds, unreadCount }),
  });
}

describe('useReadStatus', () => {
  beforeEach(() => {
    // jest.setup.dom.js の clearAllMocks は実装を消さないため、実装もここで固定する
    mockFetch.mockReset();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
    localStorage.clear();
  });

  it('マウント時にサーバーへ実際に fetch する（initialData が常時 fresh 判定になり未読取得が止まる回帰を防ぐ）', async () => {
    // initialDataUpdatedAt: 0 が無いと query-core は dataUpdatedAt = Date.now() を入れ、
    // staleTime: 5分 の下で常に fresh 判定になってサーバーへ到達しなくなる。
    // unreadCount のアサートだけでは initialData と値が一致した場合に見逃すため、
    // 「fetch が実際に呼ばれたか」を直接検証する。
    mockServerReadStatus(['a1'], 7);

    renderHook(() => useReadStatus(), {
      wrapper: createWrapper(createTestQueryClient()),
    });

    await waitFor(() => {
      expect(readStatusGetCalls()).toHaveLength(1);
    });
    expect(readStatusGetCalls()[0][0]).toBe(READ_STATUS_URL);
  });

  it('unreadCount がサーバー値を反映する（initialData の 0 で固定されず一括既読ボタンが有効になる）', async () => {
    // unreadCount === 0 のまま固定されると mark-all-read-button が常時 disabled になる。
    // localStorage に既読データがある状態（initialData が非空）でも上書きされることを確認する。
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}:user-1`,
      JSON.stringify(['stored-1'])
    );
    mockServerReadStatus(['a1', 'a2'], 7);

    const { result } = renderHook(() => useReadStatus(), {
      wrapper: createWrapper(createTestQueryClient()),
    });

    // 初期値は localStorage 由来で unreadCount: 0
    expect(result.current.unreadCount).toBe(0);

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(7);
    });
    expect(result.current.isRead('a1')).toBe(true);
    expect(result.current.isRead('a2')).toBe(true);
  });

  it('セッションの isPending が false→true→false と揺れても同一クエリのままで再取得しない（タブ復帰ごとに既読が再取得される回帰を防ぐ）', async () => {
    // better-auth は初回解決後もタブ復帰時の再検証で isPending を true へ戻す。
    // その揺れが queryKey（storageUserId）や enabled に漏れると、タブ復帰ごとに
    // 別クエリ扱い or false→true 再遷移で既読状態が取り直される。
    mockServerReadStatus([], 3);

    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(() => useReadStatus(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(3);
    });
    const keysAfterMount = readStatusQueryKeys(queryClient);
    const callsAfterMount = readStatusGetCalls().length;
    expect(keysAfterMount).toHaveLength(1);
    expect(callsAfterMount).toBe(1);

    // 再検証で isPending が true へ戻る → その後 false へ戻る
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: true,
    });
    rerender();
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
    rerender();
    await flush();

    expect(readStatusQueryKeys(queryClient)).toEqual(keysAfterMount);
    expect(readStatusGetCalls()).toHaveLength(callsAfterMount);
    expect(result.current.unreadCount).toBe(3);
  });

  it('identity が一度も確定していない間（初回 isPending）は localStorage へ書き込まない（guest バケット汚染の回帰を防ぐ）', async () => {
    // storageUserId の undefined は「identity 未確定」を表す意図的な sentinel で、
    // localStorage 書き込みの抑止根拠になっている。`userId ?? 'guest'` に潰すと
    // ログイン済みユーザーの未確定な窓で既読が guest バケットへ書かれる（identity 汚染）。
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    // 旧ゲストキー（マイグレーション対象）を置く: sentinel 中はこれも触ってはいけない
    localStorage.setItem(STORAGE_KEY_PREFIX, JSON.stringify(['legacy-1']));
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    const { result } = renderHook(() => useReadStatus(), {
      wrapper: createWrapper(createTestQueryClient()),
    });
    await flush();

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}:guest`)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_PREFIX)).toBe(
      JSON.stringify(['legacy-1'])
    );
    // identity 未確定の間はサーバーにも問い合わせない
    expect(readStatusGetCalls()).toHaveLength(0);
    expect(result.current.readArticleIds.size).toBe(0);

    setItemSpy.mockRestore();
  });
});
