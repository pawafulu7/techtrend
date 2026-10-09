/**
 * お気に入り画面: 解除に失敗して一覧に戻すときは通知する。404（既に未登録）は成功と同じ扱い（issue #701）
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FavoritesContent } from '@/app/favorites/_components/favorites-content';

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user-1' } }, isPending: false }),
  },
}));

const FAVORITE = {
  id: 'a1',
  title: 'Article 1',
  summary: '',
  publishedAt: '2026-10-01T00:00:00.000Z',
  favoritedAt: '2026-10-02T00:00:00.000Z',
  tags: [],
};

// 楽観的に一覧から消し、invalidateQueries で取り直すと戻る、というキャッシュの動きを状態で再現する
const mockRemoveFavoriteFromCache = jest.fn();
let mockFavorites: (typeof FAVORITE)[] = [];
let mockSetFavorites: (next: (typeof FAVORITE)[]) => void = () => {};
// 一覧そのものの取得に失敗した状態（data が無く、error がある）
let mockListError: Error | null = null;
// 一覧の取得結果を部分的に差し替える（再試行中・取得済みの一覧がある状態の失敗など）
let mockOverrides: Record<string, unknown> = {};
const mockFetchNextPage = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/app/hooks/use-infinite-favorites', () => ({
  useInfiniteFavorites: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useState } = require('react');
    const [favorites, setFavorites] = useState(mockFavorites);
    mockSetFavorites = setFavorites;
    if (mockListError) {
      return {
        allFavorites: [],
        totalCount: 0,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: mockListError,
        data: undefined,
        refetch: mockRefetch,
        isFetching: false,
        errorUpdateCount: 1,
        removeFavoriteFromCache: jest.fn(),
        ...mockOverrides,
      };
    }
    return {
      allFavorites: favorites,
      totalCount: 1,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: mockFetchNextPage,
      error: null,
      data: { pages: [] },
      refetch: mockRefetch,
      isFetching: false,
      errorUpdateCount: 0,
      removeFavoriteFromCache: (id: string) => {
        mockRemoveFavoriteFromCache(id);
        setFavorites((prev: (typeof FAVORITE)[]) =>
          prev.filter((a) => a.id !== id)
        );
      },
      ...mockOverrides,
    };
  },
}));

jest.mock('@/app/components/article/favorite-card', () => ({
  FavoriteArticleCard: ({
    article,
    onRemoveFavorite,
  }: {
    article: { id: string };
    onRemoveFavorite: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onRemoveFavorite(article.id)}>
      解除 {article.id}
    </button>
  ),
  FavoriteSkeletonGrid: () => null,
}));

jest.mock('@/app/components/common/infinite-scroll-trigger', () => ({
  InfiniteScrollTrigger: () => null,
}));

function renderFavorites() {
  mockFavorites = [FAVORITE];
  const queryClient = new QueryClient();
  // サーバーから取り直すと、解除できなかった記事が一覧に戻る
  const invalidateSpy = jest
    .spyOn(queryClient, 'invalidateQueries')
    .mockImplementation(async () => {
      mockSetFavorites([FAVORITE]);
    });
  render(
    <QueryClientProvider client={queryClient}>
      <FavoritesContent initialQuery="" initialSort="favoritedAt-desc" />
    </QueryClientProvider>
  );
  return { invalidateSpy };
}

describe('FavoritesContent: 解除の失敗（issue #701）', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockListError = null;
    mockOverrides = {};
  });

  it.each([
    [
      'API が失敗を返したとき',
      () => Promise.resolve({ ok: false, status: 500 }),
    ],
    ['通信に失敗したとき', () => Promise.reject(new Error('Network error'))],
  ])('%s は一覧を取り直して通知する', async (_label, fetchImpl) => {
    global.fetch = jest.fn().mockImplementation(fetchImpl);
    const { invalidateSpy } = renderFavorites();

    await userEvent.click(screen.getByRole('button', { name: '解除 a1' }));

    // 失敗して取り直した後は、一覧に戻っている
    expect(mockRemoveFavoriteFromCache).toHaveBeenCalledWith('a1');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '解除 a1' })
      ).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description:
            'お気に入りの解除に失敗しました。もう一度お試しください。',
        })
      )
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['infinite-favorites'],
    });
  });

  it('404（既に未登録）は成功と同じ扱いにし、通知しない', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const events: Event[] = [];
    const listener = (e: Event) => events.push(e);
    window.addEventListener('article-favorite-changed', listener);

    try {
      const { invalidateSpy } = renderFavorites();
      await userEvent.click(screen.getByRole('button', { name: '解除 a1' }));

      await waitFor(() => expect(events).toHaveLength(1));
      // 成功と同じ扱いなので、一覧から消えたまま
      expect(
        screen.queryByRole('button', { name: '解除 a1' })
      ).not.toBeInTheDocument();
      expect(mockToast).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('article-favorite-changed', listener);
    }
  });

  it('一覧の取得に失敗したら、生の文言・「0件」・空状態ではなく失敗と再試行を出す', async () => {
    mockListError = new Error(
      'Failed to fetch favorites: 500 Internal Server Error'
    );
    renderFavorites();

    expect(
      screen.getByText('お気に入りを読み込めませんでした')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to fetch favorites/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('(0件)')).not.toBeInTheDocument();
    expect(
      screen.queryByText('お気に入り記事がありません')
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('一覧の取得の失敗後に再試行している間は、スケルトンではなく失敗表示と「再試行中…」を出す', () => {
    mockListError = new Error('failed');
    mockOverrides = {
      isLoading: true,
      error: null,
      isFetching: true,
      errorUpdateCount: 1,
    };
    renderFavorites();

    expect(
      screen.getByText('お気に入りを読み込めませんでした')
    ).toBeInTheDocument();
    // 再試行中は aria-disabled で押せない状態にする（disabled だとフォーカスが外れるため。Issue #700）
    expect(screen.getByRole('button', { name: '再試行中…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('取得済みの一覧がある状態で再取得に失敗したら、一覧を残して古いことを示す', () => {
    mockOverrides = { error: new Error('failed'), errorUpdateCount: 1 };
    renderFavorites();

    expect(
      screen.getByText('最新のお気に入りを読み込めませんでした')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '解除 a1' })).toBeInTheDocument();
  });

  it('続きのページの取得に失敗したら、下端に出して続きだけを再試行する', async () => {
    mockOverrides = {
      error: new Error('failed'),
      errorUpdateCount: 1,
      isFetchNextPageError: true,
      hasNextPage: true,
    };
    renderFavorites();

    expect(screen.getByText('続きを読み込めませんでした')).toBeInTheDocument();
    expect(
      screen.queryByText('最新のお気に入りを読み込めませんでした')
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
    expect(mockRefetch).not.toHaveBeenCalled();
  });
});
