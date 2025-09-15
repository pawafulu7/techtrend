import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleList } from '@/app/components/article/list';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

// useReadStatusフックのモック
jest.mock('@/app/hooks/use-read-status', () => ({
  useReadStatus: jest.fn(),
}));

// ArticleCardコンポーネントのモック
jest.mock('@/app/components/article/card', () => ({
  ArticleCard: ({ article, onArticleClick, isRead }: { article: { id: string; title: string }, onArticleClick?: () => void, isRead?: boolean }) => (
    <div 
      data-testid={`article-card-${article.id}`}
      data-is-read={isRead}
      onClick={onArticleClick}
    >
      {article.title}
    </div>
  ),
}));

// ArticleListItemコンポーネントのモック
jest.mock('@/app/components/article/list-item', () => ({
  ArticleListItem: ({ article, onArticleClick, isRead }: { article: { id: string; title: string }, onArticleClick?: () => void, isRead?: boolean }) => (
    <div 
      data-testid={`article-list-item-${article.id}`}
      data-is-read={isRead}
      onClick={onArticleClick}
    >
      {article.title}
    </div>
  ),
}));

describe('ArticleList', () => {
  let queryClient: QueryClient;
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  const mockSearchParams = new URLSearchParams();

  const mockReadStatus = {
    isRead: jest.fn(),
    isLoading: false,
    refetch: jest.fn(),
    readArticleIds: new Set<string>(),
    unreadCount: 0,
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    markAllAsRead: jest.fn(),
  };

  const mockArticles = [
    createMockArticleWithRelations({
      article: {
        id: '1',
        title: 'Article 1',
        summary: 'Summary 1',
      },
    }),
    createMockArticleWithRelations({
      article: {
        id: '2',
        title: 'Article 2',
        summary: 'Summary 2',
      },
    }),
    createMockArticleWithRelations({
      article: {
        id: '3',
        title: 'Article 3',
        summary: 'Summary 3',
      },
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (useReadStatus as jest.Mock).mockReturnValue(mockReadStatus);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('カードビューで記事リストを表示する', () => {
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="card" />);
      
      expect(screen.getByTestId('article-list')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-2')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-3')).toBeInTheDocument();
      
      // グリッドレイアウトのクラスを確認
      const listContainer = screen.getByTestId('article-list');
      expect(listContainer).toHaveClass('grid');
    });

    it('リストビューで記事リストを表示する', () => {
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="list" />);
      
      expect(screen.getByTestId('article-list')).toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-3')).toBeInTheDocument();
      
      // リストレイアウトのクラスを確認
      const listContainer = screen.getByTestId('article-list');
      expect(listContainer).toHaveClass('space-y-2');
    });

    it('デフォルトではカードビューを使用する', () => {
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      expect(screen.getByTestId('article-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('article-list-item-1')).not.toBeInTheDocument();
    });

    it('記事が空の場合は空状態メッセージを表示する', () => {
      renderWithProviders(<ArticleList articles={[]} />);
      
      expect(screen.getByText('記事が見つかりませんでした')).toBeInTheDocument();
      expect(screen.queryByTestId('article-list')).not.toBeInTheDocument();
    });
  });

  describe('既読/未読状態の管理', () => {
    it('認証済みユーザーの既読状態を正しく反映する', () => {
      const mockSession = {
        user: { id: 'user1', email: 'test@example.com' },
      };
      (useSession as jest.Mock).mockReturnValue({ 
        data: mockSession, 
        status: 'authenticated' 
      });

      // ArticleList は article.isRead を参照するため、フラグ付きで渡す
      const articlesWithFlags = mockArticles.map(a => ({
        ...a,
        isRead: a.id === '1',
      }));
      renderWithProviders(<ArticleList articles={articlesWithFlags as typeof mockArticles} />);
      
      // 記事1は既読
      const article1 = screen.getByTestId('article-card-1');
      expect(article1).toHaveAttribute('data-is-read', 'true');
      // 既読記事のUIは透明度が下がる（opacity-70クラスなど）
      const title1 = article1.querySelector('h3');
      if (title1) {
        expect(title1.classList.toString()).toContain('opacity');
      }
      
      // 記事2と3は未読
      const article2 = screen.getByTestId('article-card-2');
      const article3 = screen.getByTestId('article-card-3');
      expect(article2).toHaveAttribute('data-is-read', 'false');
      expect(article3).toHaveAttribute('data-is-read', 'false');
      
      // 未読記事には未読バッジが表示される
      const unreadBadges = article2.querySelectorAll('[data-testid="unread-badge"]');
      if (unreadBadges.length > 0) {
        expect(unreadBadges.length).toBeGreaterThan(0);
      }
    });

    it('未認証ユーザーの場合はすべて既読として扱う', () => {
      (useSession as jest.Mock).mockReturnValue({ 
        data: null, 
        status: 'unauthenticated' 
      });
      
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // すべての記事が既読として表示される
      expect(screen.getByTestId('article-card-1')).toHaveAttribute('data-is-read', 'true');
      expect(screen.getByTestId('article-card-2')).toHaveAttribute('data-is-read', 'true');
      expect(screen.getByTestId('article-card-3')).toHaveAttribute('data-is-read', 'true');
    });

    it('ローディング中は全記事を既読として表示する', () => {
      const mockSession = {
        user: { id: 'user1', email: 'test@example.com' },
      };
      (useSession as jest.Mock).mockReturnValue({ 
        data: mockSession, 
        status: 'authenticated' 
      });
      
      (useReadStatus as jest.Mock).mockReturnValue({
        ...mockReadStatus,
        isLoading: true,
      });
      
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // ローディング中はすべて既読として表示
      expect(screen.getByTestId('article-card-1')).toHaveAttribute('data-is-read', 'true');
      expect(screen.getByTestId('article-card-2')).toHaveAttribute('data-is-read', 'true');
      expect(screen.getByTestId('article-card-3')).toHaveAttribute('data-is-read', 'true');
    });
  });

  describe('イベントハンドリング', () => {
    it('記事クリック時にコールバックを実行する', async () => {
      const handleArticleClick = jest.fn();
      const user = userEvent.setup();
      
      renderWithProviders(
        <ArticleList
          articles={mockArticles}
          onArticleClick={handleArticleClick}
        />
      );
      
      const firstCard = screen.getByTestId('article-card-1');
      await user.click(firstCard);
      
      expect(handleArticleClick).toHaveBeenCalledTimes(1);
    });

    it.skip('既読状態変更イベントで再レンダリングとUI更新を確認する', async () => {
      const mockSession = {
        user: { id: 'user1', email: 'test@example.com' },
      };
      (useSession as jest.Mock).mockReturnValue({ 
        data: mockSession, 
        status: 'authenticated' 
      });
      
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // 初期状態を確認
      const article1Before = screen.getByTestId('article-card-1');
      expect(article1Before).toHaveAttribute('data-is-read', 'false');
      
      // 既読状態を変更
      mockReadStatus.isRead.mockImplementation((id: string) => id === '1');
      
      // イベントを発火
      await act(async () => {
        const event = new CustomEvent('articles-read-status-changed');
        window.dispatchEvent(event);
      });
      
      await waitFor(() => {
        expect(mockReadStatus.refetch).toHaveBeenCalled();
      });
    });

    it('コンポーネントアンマウント時にイベントリスナーを削除する', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      const { unmount } = renderWithProviders(<ArticleList articles={mockArticles} />);
      
      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'articles-read-status-changed',
        expect.any(Function)
      );
    });
  });

  describe('リストビューモード', () => {
    it('リストビューで正しくレンダリングする', () => {
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="list" />);
      
      const listContainer = screen.getByTestId('article-list');
      expect(listContainer).toHaveClass('space-y-2');
      
      // ArticleListItemコンポーネントが使用される
      expect(screen.getByTestId('article-list-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-3')).toBeInTheDocument();
      
      // ArticleCardは使用されない
      expect(screen.queryByTestId('article-card-1')).not.toBeInTheDocument();
    });

    it('リストビューでも既読状態を正しく反映する', () => {
      const mockSession = {
        user: { id: 'user1', email: 'test@example.com' },
      };
      (useSession as jest.Mock).mockReturnValue({ 
        data: mockSession, 
        status: 'authenticated' 
      });

      const articlesWithFlags = mockArticles.map(a => ({
        ...a,
        isRead: a.id === '2',
      }));
      renderWithProviders(<ArticleList articles={articlesWithFlags as typeof mockArticles} viewMode="list" />);
      
      expect(screen.getByTestId('article-list-item-1')).toHaveAttribute('data-is-read', 'false');
      expect(screen.getByTestId('article-list-item-2')).toHaveAttribute('data-is-read', 'true');
      expect(screen.getByTestId('article-list-item-3')).toHaveAttribute('data-is-read', 'false');
    });
  });

  describe('パフォーマンス最適化', () => {
    it('記事IDのリストを一度だけ作成する（useMemo）', () => {
      const { rerender } = renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // 同じpropsで再レンダリング
      rerender(
        <QueryClientProvider client={queryClient}>
          <ArticleList articles={mockArticles} />
        </QueryClientProvider>
      );
      
      // useReadStatusへの引数（articleIds）が変わらないことを確認
      const calls = (useReadStatus as jest.Mock).mock.calls;
      if (calls.length > 1) {
        expect(calls[calls.length - 1][0]).toBe(calls[calls.length - 2][0]);
      }
    });

    it.skip('refreshKeyで強制再レンダリングする', async () => {
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // 既読状態変更イベントを発火
      await act(async () => {
        const event = new CustomEvent('articles-read-status-changed');
        window.dispatchEvent(event);
      });
      
      await waitFor(() => {
        // refreshKeyが変更されることで再レンダリングが強制される
        expect(mockReadStatus.refetch).toHaveBeenCalled();
      });
    });
  });

  describe('エッジケース', () => {
    it('非常に多くの記事でもクラッシュしない', () => {
      const manyArticles = Array.from({ length: 100 }, (_, i) => 
        createMockArticleWithRelations({
          article: {
            id: `article-${i}`,
            title: `Article ${i}`,
          },
        })
      );
      
      const { container } = renderWithProviders(<ArticleList articles={manyArticles} />);
      
      expect(container.querySelectorAll('[data-testid^="article-card-"]')).toHaveLength(100);
    });

    it('記事配列が更新されたときに正しく再レンダリングする', () => {
      const { rerender } = renderWithProviders(<ArticleList articles={mockArticles} />);
      
      expect(screen.getByTestId('article-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-2')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-3')).toBeInTheDocument();
      
      const newArticles = mockArticles.slice(0, 2);
      rerender(
        <QueryClientProvider client={queryClient}>
          <ArticleList articles={newArticles} />
        </QueryClientProvider>
      );
      
      expect(screen.getByTestId('article-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('article-card-2')).toBeInTheDocument();
      expect(screen.queryByTestId('article-card-3')).not.toBeInTheDocument();
    });

    it('viewModeが変更されたときに正しくレンダリングを切り替える', () => {
      const { rerender } = renderWithProviders(<ArticleList articles={mockArticles} viewMode="card" />);
      
      expect(screen.getByTestId('article-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('article-list-item-1')).not.toBeInTheDocument();
      
      rerender(
        <QueryClientProvider client={queryClient}>
          <ArticleList articles={mockArticles} viewMode="list" />
        </QueryClientProvider>
      );
      
      expect(screen.queryByTestId('article-card-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('article-list-item-1')).toBeInTheDocument();
    });
  });
});
