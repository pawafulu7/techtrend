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
jest.mock('@/app/hooks/use-infinite-favorites', () => ({
  useInfiniteFavorites: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useState } = require('react');
    const [favorites, setFavorites] = useState(mockFavorites);
    mockSetFavorites = setFavorites;
    return {
      allFavorites: favorites,
      totalCount: 1,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      error: null,
      removeFavoriteFromCache: (id: string) => {
        mockRemoveFavoriteFromCache(id);
        setFavorites((prev: (typeof FAVORITE)[]) =>
          prev.filter((a) => a.id !== id)
        );
      },
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
});
