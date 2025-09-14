import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleList } from '@/app/components/article/list';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useReadStatus } from '@/app/hooks/use-read-status';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMockArticleWithRelations,
  createMockSource,
  mockArticleWithRelations
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

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/app/hooks/use-read-status', () => ({
  useReadStatus: jest.fn(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));


// ArticleCardコンポーネントのモック
jest.mock('@/app/components/article/card', () => ({
  ArticleCard: ({ article, onArticleClick, isRead }: any) => (
    <article 
      data-testid="article-card" 
      onClick={() => onArticleClick?.()}
    >
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      {!isRead && <span>未読</span>}
    </article>
  ),
}));

// ArticleListItemコンポーネントのモック
jest.mock('@/app/components/article/list-item', () => ({
  ArticleListItem: ({ article, onArticleClick, isRead }: any) => (
    <div 
      data-testid="article-list-item" 
      onClick={() => onArticleClick?.()}
    >
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
      status: 'authenticated'
    });
    mockedUseReadStatus.mockReturnValue(mockReadStatus);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
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
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="list" />);
      
      const container = screen.getByTestId('article-list');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('space-y-2');
      expect(container).not.toHaveClass('grid');
      
      const listItems = screen.getAllByTestId('article-list-item');
      expect(listItems).toHaveLength(3);
    });

    it('renders empty state when no articles', () => {
      renderWithProviders(<ArticleList articles={[]} />);
      
      expect(screen.getByText('記事が見つかりませんでした')).toBeInTheDocument();
      expect(screen.queryByTestId('article-list')).not.toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('handles article click events in card view', async () => {
      const user = userEvent.setup();
      const handleArticleClick = jest.fn();
      renderWithProviders(<ArticleList articles={mockArticles} onArticleClick={handleArticleClick} />);
      
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
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // mockReadStatusは記事ID '1' のみを既読として返す
      expect(mockReadStatus.isRead).toHaveBeenCalledWith('1');
      expect(mockReadStatus.isRead).toHaveBeenCalledWith('2');
      expect(mockReadStatus.isRead).toHaveBeenCalledWith('3');
    });

    it('treats all articles as read for unauthenticated users', () => {
      mockedUseSession.mockReturnValue({ 
        data: null, 
        status: 'unauthenticated' 
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

    it('refetches read status on custom event', async () => {
      renderWithProviders(<ArticleList articles={mockArticles} />);
      
      // カスタムイベントを発火
      const event = new Event('articles-read-status-changed');
      window.dispatchEvent(event);
      
      await waitFor(() => {
        expect(mockReadStatus.refetch).toHaveBeenCalled();
      });
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

    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      const { unmount } = renderWithProviders(<ArticleList articles={mockArticles} />);
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
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="card" />);
      
      const container = screen.getByTestId('article-list');
      expect(container).toHaveClass('grid');
      expect(container).toHaveClass('grid-cols-1');
      expect(container).toHaveClass('sm:grid-cols-2');
      expect(container).toHaveClass('md:grid-cols-2');
      expect(container).toHaveClass('lg:grid-cols-3');
      expect(container).toHaveClass('xl:grid-cols-4');
    });

    it('applies correct spacing classes for list view', () => {
      renderWithProviders(<ArticleList articles={mockArticles} viewMode="list" />);
      
      const container = screen.getByTestId('article-list');
      expect(container).toHaveClass('space-y-2');
    });
  });

});