/**
 * useIsSessionPendingLatched のテスト。
 *
 * このラッチは lib/hooks/use-personalization-preferences.ts と
 * app/hooks/use-read-status.ts の enabled を支えており、外れると
 * 「enabled が false→true に再遷移 → 読み込み済み全ページの再取得」が復活する。
 *
 * 特に重要なのが「再マウント」経路。ラッチをフックインスタンス単位（useState）で
 * 持っていた頃は、新しくマウントされたコンポーネントが必ず未解決から始まるため、
 * 記事詳細 → ホームのように再マウントが起きるとラッチが効かなかった。
 * キャッシュは QueryClient 側に残るので、新インスタンスが N ページを持つ既存クエリを
 * 購読したところへ enabled の false→true が来て、そのまま元のバグが再現する。
 */

import { renderHook } from '@testing-library/react';
import {
  useIsSessionPendingLatched,
  resetSessionResolvedLatchForTests,
} from '@/lib/auth/use-session-resolved';

// better-auth の client は ESM のため Jest では実体を読み込ませない。
const mockUseSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

const session = (isPending: boolean) => ({
  data: { user: { id: 'user-1' } },
  isPending,
});

describe('useIsSessionPendingLatched', () => {
  beforeEach(() => {
    // モジュールスコープの共有ラッチはテスト間で漏れるため必ず戻す
    resetSessionResolvedLatchForTests();
    mockUseSession.mockReset();
  });

  it('まだ一度も解決していなければ isPending をそのまま返す', () => {
    mockUseSession.mockReturnValue(session(true));

    const { result } = renderHook(() => useIsSessionPendingLatched());

    expect(result.current).toBe(true);
  });

  it('一度解決したら、同一インスタンスで isPending が true へ戻っても false のまま', () => {
    mockUseSession.mockReturnValue(session(false));
    const { result, rerender } = renderHook(() => useIsSessionPendingLatched());
    expect(result.current).toBe(false);

    mockUseSession.mockReturnValue(session(true));
    rerender();

    expect(result.current).toBe(false);
  });

  it('解決済みなら、新しくマウントしたインスタンスも初回レンダーから false（再マウント経路のガード）', () => {
    // 1 つ目のインスタンスでセッションが解決する
    mockUseSession.mockReturnValue(session(false));
    const first = renderHook(() => useIsSessionPendingLatched());
    expect(first.result.current).toBe(false);
    first.unmount();

    // 再マウントの瞬間に session fetch が in-flight（isPending: true）
    mockUseSession.mockReturnValue(session(true));
    const second = renderHook(() => useIsSessionPendingLatched());

    // インスタンス単位のラッチだとここが true になり、直後の false 遷移で
    // enabled が false→true に振れて全ページ再取得が起きる
    expect(second.result.current).toBe(false);
  });

  it('ラッチのリセット後は未解決として扱う（テスト間の状態漏れ防止の確認）', () => {
    mockUseSession.mockReturnValue(session(false));
    renderHook(() => useIsSessionPendingLatched());

    resetSessionResolvedLatchForTests();

    mockUseSession.mockReturnValue(session(true));
    const { result } = renderHook(() => useIsSessionPendingLatched());

    expect(result.current).toBe(true);
  });
});
