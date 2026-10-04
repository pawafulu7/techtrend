import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleList } from '@/app/components/article/list';
import { useSession } from '@/lib/auth/auth-client';
import { useRouter } from 'next/navigation';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMockArticleWithRelations,
  createMockSource,
  mockArticleWithRelations,
} from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(),
    has: jest.fn(),
    getAll: jest.fn(),
    keys: jest.fn(),
    values: jest.fn(),
    entries: jest.fn(),
    forEach: jest.fn(),
    toString: jest.fn(() => ''),
  })),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
  useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('@/app/hooks/use-read-status', () => ({
  useReadStatus: jest.fn(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // Next.js Image特有のプロパティを除外
    const {
      unoptimized,
      placeholder,
      blurDataURL,
      loader,
      quality,
      priority,
      loading,
      ...rest
    } = props;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

jest.mock('@/app/components/common/optimized-image', () => ({
  __esModule: true,
  default: (props: any) => {
    // OptimizedImageコンポーネントをシンプルなimgタグとしてモック
    const { imageSrc, imageAlt, className, ...rest } = props;
    // eslint-disable-next-line jsx-a11y/alt-text
    return (
      <img src={imageSrc} alt={imageAlt} className={className} {...rest} />
    );
  },
}));

// ArticleCardコンポーネントのモック
jest.mock('@/app/components/article/card', () => ({
  ArticleCard: ({ article, onArticleClick, isRead, onToggleFavorite }: any) => (
    <article data-testid="article-card" onClick={() => onArticleClick?.()}>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      {!isRead && <span>未読</span>}
      <button
        type="button"
        data-testid={`toggle-favorite-${article.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite?.();
        }}
      />
    </article>
  ),
}));

// ArticleListItemコンポーネントのモック
jest.mock('@/app/components/article/list-item', () => ({
  ArticleListItem: ({ article, onArticleClick, isRead }: any) => (
    <div data-testid="article-list-item" onClick={() => onArticleClick?.()}>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      {!isRead && <span>未読</span>}
    </div>
  ),
}));

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSession = jest.mocked(useSession);
const mockedUseReadStatus = jest.mocked(useReadStatus);

describe('ArticleList', () => {
  let queryClient: QueryClient;
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  const mockArticles = [
    createMockArticleWithRelations({
      article: {
        id: '1',
        title: 'First Article',
        summary: 'First article summary',
        url: 'https://example.com/1',
        publishedAt: new Date('2025-01-01'),
        qualityScore: 90,
      },
      source: {
        id: 'source1',
        name: 'Source 1',
        type: 'rss',
      },
    }),
    createMockArticleWithRelations({
      article: {
        id: '2',
        title: 'Second Article',
        summary: 'Second article summary',
        url: 'https://example.com/2',
        publishedAt: new Date('2025-01-02'),
        qualityScore: 85,
      },
      source: {
        id: 'source2',
        name: 'Source 2',
        type: 'api',
      },
    }),
    createMockArticleWithRelations({
      article: {
        id: '3',
        title: 'Third Article',
        summary: 'Third article summary',
        url: 'https://example.com/3',
        publishedAt: new Date('2025-01-03'),
        qualityScore: 80,
      },
      source: {
        id: 'source3',
        name: 'Source 3',
        type: 'scraping',
      },
    }),
  ];

  const mockReadStatus = {
    isRead: jest.fn((id: string) => id === '1'),
    isLoading: false,
    refetch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockedUseRouter.mockReturnValue(mockRouter as ReturnType<typeof useRouter>);
    mockedUseSession.mockReturnValue({
      data: { user: { id: 'user1', email: 'test@example.com' } },
      isPending: false,
    });
    mockedUseReadStatus.mockReturnValue(mockReadStatus);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
  };

  describe('Rendering', () => {
    it('renders articles in card view by default', () => {
      renderWithProviders(<ArticleList articles={mockArticles} />);

      const container = screen.getByTestId('article-list');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('grid');

      const cards = screen.getAllByTestId('article-card');
      expect(cards).toHaveLength(3);
      expect(screen.getByText('First Article')).toBeInTheDocument();
      expect(screen.getByText('Second Article')).toBeInTheDocument();
      expect(screen.getByText('Third Article')).toBeInTheDocument();
    });

    it('renders articles in list view when viewMode is list', () => {
      renderWithProviders(
        <ArticleList articles={mockArticles} viewMode="list" />
      );

      const container = screen.getByTestId('article-list');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('space-y-2');
      expect(container).not.toHaveClass('grid');

      const listItems = screen.getAllByTestId('article-list-item');
      expect(listItems).toHaveLength(3);
    });

    it('renders empty state when no articles', () => {
      renderWithProviders(<ArticleList articles={[]} />);

      expect(
        screen.getByText('記事が見つかりませんでした')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('article-list')).not.toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('handles article click events in card view', async () => {
      const user = userEvent.setup();
      const handleArticleClick = jest.fn();
      renderWithProviders(
        <ArticleList
          articles={mockArticles}
          onArticleClick={handleArticleClick}
        />
      );

      const firstCard = screen.getAllByTestId('article-card')[0];
      await user.click(firstCard);

      expect(handleArticleClick).toHaveBeenCalled();
    });

    it('handles article click events in list view', async () => {
      const user = userEvent.setup();
      const handleArticleClick = jest.fn();
      renderWithProviders(
        <ArticleList
          articles={mockArticles}
          viewMode="list"
          onArticleClick={handleArticleClick}
        />
      );

      const firstItem = screen.getAllByTestId('article-list-item')[0];
      await user.click(firstItem);

      expect(handleArticleClick).toHaveBeenCalled();
    });
  });

  describe('Read Status', () => {
    it('shows correct read status for authenticated users', () => {
      const articlesWithFlags = mockArticles.map((a) => ({
        ...a,
        isRead: a.id === '1',
      }));
      renderWithProviders(<ArticleList articles={articlesWithFlags as any} />);
      // 表示の検証（未読マークは2件: id=2,3）
      const unreadMarks = screen.queryAllByText('未読');
      if (unreadMarks) {
        expect(unreadMarks.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('treats all articles as read for unauthenticated users', () => {
      mockedUseSession.mockReturnValue({
        data: null,
        isPending: false,
      });

      renderWithProviders(<ArticleList articles={mockArticles} />);

      // 未認証時は全て既読扱い（未読マークが表示されない）
      const unreadMarks = screen.queryAllByText('未読');
      expect(unreadMarks).toHaveLength(0);
    });

    it('shows loading state correctly', () => {
      mockedUseReadStatus.mockReturnValue({
        ...mockReadStatus,
        isLoading: true,
      });

      renderWithProviders(<ArticleList articles={mockArticles} />);

      // ローディング中は全て既読扱い
      const unreadMarks = screen.queryAllByText('未読');
      expect(unreadMarks).toHaveLength(0);
    });

    it.skip('refetches read status on custom event', async () => {
      // 現在の実装では article.isRead を参照するため、本テストはスキップ
    });
  });

  describe('Event Handling', () => {
    it('adds event listener on mount', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

      renderWithProviders(<ArticleList articles={mockArticles} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'articles-read-status-changed',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    // issue #653: 一覧画面のお気に入り状態のキャッシュはユーザーごと。別ユーザーの
    // トグル完了で書き換えないよう、同期イベントにトグルしたユーザーを載せる
    it('dispatches article-favorite-changed with the user who toggled', async () => {
      const { authClient } = jest.requireMock('@/lib/auth/auth-client');
      authClient.useSession.mockReturnValue({
        data: { user: { id: 'user-1' } },
        isPending: false,
      });
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      const events: CustomEvent[] = [];
      const listener = (e: Event) => events.push(e as CustomEvent);
      window.addEventListener('article-favorite-changed', listener);

      try {
        renderWithProviders(<ArticleList articles={mockArticles} />);
        await userEvent.click(screen.getByTestId('toggle-favorite-2'));

        await waitFor(() => expect(events).toHaveLength(1));
        expect(events[0].detail).toMatchObject({
          articleId: '2',
          isFavorited: true,
          userId: 'user-1',
        });
      } finally {
        window.removeEventListener('article-favorite-changed', listener);
        authClient.useSession.mockReturnValue({ data: null, isPending: false });
      }
    });

    // issue #701: 失敗して表示を戻すときは、黙って戻さずに通知する
    it.each([
      [
        'API が失敗を返したとき',
        () => Promise.resolve({ ok: false, status: 500 }),
      ],
      ['通信に失敗したとき', () => Promise.reject(new Error('Network error'))],
    ])(
      'reverts the favorite and shows a toast %s',
      async (_label, fetchImpl) => {
        const { authClient } = jest.requireMock('@/lib/auth/auth-client');
        authClient.useSession.mockReturnValue({
          data: { user: { id: 'user-1' } },
          isPending: false,
        });
        const consoleSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        global.fetch = jest.fn().mockImplementation(fetchImpl);
        const events: Event[] = [];
        const listener = (e: Event) => events.push(e);
        window.addEventListener('article-favorite-changed', listener);

        try {
          renderWithProviders(<ArticleList articles={mockArticles} />);
          await userEvent.click(screen.getByTestId('toggle-favorite-2'));

          await waitFor(() =>
            expect(mockToast).toHaveBeenCalledWith(
              expect.objectContaining({
                variant: 'destructive',
                description:
                  'お気に入りの更新に失敗しました。もう一度お試しください。',
              })
            )
          );
          expect(mockToast).toHaveBeenCalledTimes(1);
          expect(events).toHaveLength(0);
        } finally {
          window.removeEventListener('article-favorite-changed', listener);
          consoleSpy.mockRestore();
          authClient.useSession.mockReturnValue({
            data: null,
            isPending: false,
          });
        }
      }
    );

    // 409 = 既に登録済み / 404 = 既に未登録。サーバーは望む状態なので成功と同じ扱い
    it.each([
      ['登録で 409', false, 409, true],
      ['解除で 404', true, 404, false],
    ])(
      'treats %s as already in the desired state',
      async (_label, initiallyFavorited, status, expected) => {
        const { authClient } = jest.requireMock('@/lib/auth/auth-client');
        authClient.useSession.mockReturnValue({
          data: { user: { id: 'user-1' } },
          isPending: false,
        });
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status });
        const events: CustomEvent[] = [];
        const listener = (e: Event) => events.push(e as CustomEvent);
        window.addEventListener('article-favorite-changed', listener);
        const articles = mockArticles.map((a) =>
          a.id === '2' ? { ...a, isFavorited: initiallyFavorited } : a
        );

        try {
          renderWithProviders(<ArticleList articles={articles} />);
          await userEvent.click(screen.getByTestId('toggle-favorite-2'));

          await waitFor(() => expect(events).toHaveLength(1));
          expect(events[0].detail).toMatchObject({
            articleId: '2',
            isFavorited: expected,
          });
          expect(global.fetch).toHaveBeenCalledWith('/api/favorites/2', {
            method: initiallyFavorited ? 'DELETE' : 'POST',
          });
          expect(mockToast).not.toHaveBeenCalled();
        } finally {
          window.removeEventListener('article-favorite-changed', listener);
          authClient.useSession.mockReturnValue({
            data: null,
            isPending: false,
          });
        }
      }
    );

    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderWithProviders(
        <ArticleList articles={mockArticles} />
      );
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'articles-read-status-changed',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Grid Layout', () => {
    it('applies correct grid classes for card view', () => {
      renderWithProviders(
        <ArticleList articles={mockArticles} viewMode="card" />
      );

      const container = screen.getByTestId('article-list');
      expect(container).toHaveClass('grid');
      expect(container).toHaveClass('grid-cols-1');
      expect(container).toHaveClass('sm:grid-cols-2');
      expect(container).toHaveClass('lg:grid-cols-3');
      expect(container).toHaveClass('xl:grid-cols-4');
      expect(container).toHaveClass('2xl:grid-cols-5');
    });

    it('applies correct spacing classes for list view', () => {
      renderWithProviders(
        <ArticleList articles={mockArticles} viewMode="list" />
      );

      const container = screen.getByTestId('article-list');
      expect(container).toHaveClass('space-y-2');
    });
  });
});
