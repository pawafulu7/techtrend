import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from '@/app/components/article/favorite-button';

/**
 * uncontrolled モードの状態遷移を検証する。
 *
 * 背景（PR #652 のレビュー指摘）:
 * - 同じ記事が 1 画面に複数並ぶ（例: /sources/[id] の「最新記事」と「人気記事TOP5」）
 *   ため、article-favorite-changed イベントでインスタンス間を同期している
 * - 楽観更新の失敗時に無条件でロールバックすると、他インスタンスの成功結果や
 *   サーバーの実状態を巻き戻してしまう
 */

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

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

const ARTICLE_ID = 'article-1';
const ADD_LABEL = 'お気に入りに追加';
const REMOVE_LABEL = 'お気に入りから削除';

function mockFetchOnce(init: { ok: boolean; status: number }) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok,
    status: init.status,
    json: async () => ({}),
  });
}

describe('FavoriteButton の状態遷移（uncontrolled）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
  });

  it('登録に成功すると「削除」ラベルへ変わり、同期イベントを発火する', async () => {
    const user = userEvent.setup();
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('article-favorite-changed', listener);

    mockFetchOnce({ ok: true, status: 200 });
    render(<FavoriteButton articleId={ARTICLE_ID} />);

    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: REMOVE_LABEL })
      ).toBeInTheDocument();
    });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({
      articleId: ARTICLE_ID,
      isFavorited: true,
    });

    window.removeEventListener('article-favorite-changed', listener);
  });

  it('POST が 409（既に登録済み）でもロールバックしない', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ ok: false, status: 409 });
    render(<FavoriteButton articleId={ARTICLE_ID} />);

    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    // サーバー上は登録済み＝目的の状態なので、登録済み表示のままにする
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: REMOVE_LABEL })
      ).toBeInTheDocument();
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('DELETE が 404（既に未登録）でもロールバックしない', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ ok: false, status: 404 });
    render(<FavoriteButton articleId={ARTICLE_ID} isFavorited />);

    await user.click(screen.getByRole('button', { name: REMOVE_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: ADD_LABEL })
      ).toBeInTheDocument();
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('サーバーエラー（500）ではロールバックしてエラーを通知する', async () => {
    const user = userEvent.setup();
    mockFetchOnce({ ok: false, status: 500 });
    render(<FavoriteButton articleId={ARTICLE_ID} />);

    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: ADD_LABEL })
      ).toBeInTheDocument();
    });
    expect(mockToast).toHaveBeenCalled();
  });

  it('ネットワーク例外でもロールバックする', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('network down')
    );
    render(<FavoriteButton articleId={ARTICLE_ID} />);

    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: ADD_LABEL })
      ).toBeInTheDocument();
    });
    expect(mockToast).toHaveBeenCalled();
  });

  it('他インスタンスの同期イベントを受けて表示を合わせる', async () => {
    render(<FavoriteButton articleId={ARTICLE_ID} />);
    expect(screen.getByRole('button', { name: ADD_LABEL })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-favorite-changed', {
          detail: { articleId: ARTICLE_ID, isFavorited: true },
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: REMOVE_LABEL })
      ).toBeInTheDocument();
    });
  });

  it('別記事の同期イベントは無視する', async () => {
    render(<FavoriteButton articleId={ARTICLE_ID} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-favorite-changed', {
          detail: { articleId: 'other-article', isFavorited: true },
        })
      );
    });

    expect(screen.getByRole('button', { name: ADD_LABEL })).toBeInTheDocument();
  });

  it('失敗のロールバックは、後から入った同期イベントを巻き戻さない', async () => {
    const user = userEvent.setup();
    // 応答を保留し、その間に別インスタンスの同期イベントを流す
    let rejectFetch: (reason?: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      })
    );

    render(<FavoriteButton articleId={ARTICLE_ID} />);
    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    // 別ボタンが登録に成功した通知（＝これが最新の正）
    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-favorite-changed', {
          detail: { articleId: ARTICLE_ID, isFavorited: true },
        })
      );
    });

    // 遅れて自分のリクエストが失敗する
    await act(async () => {
      rejectFetch(new Error('late failure'));
      await Promise.resolve();
    });

    // 同期イベントの結果（登録済み）が保たれること
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: REMOVE_LABEL })
      ).toBeInTheDocument();
    });
  });

  it('未認証ならログインへ誘導し、API を呼ばない', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof mockUseSession>);

    render(<FavoriteButton articleId={ARTICLE_ID} />);
    await user.click(screen.getByRole('button', { name: ADD_LABEL }));

    expect(mockPush).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
