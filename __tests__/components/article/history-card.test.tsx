import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryArticleCard } from '@/app/components/article/history-card';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { usePathname, useSearchParams } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

// Mock FavoriteButton to avoid complex state management in tests
jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: ({ articleId }: { articleId: string }) => (
    <button data-testid="favorite-button" data-article-id={articleId}>
      Favorite
    </button>
  ),
}));

// Mock ShareButton
jest.mock('@/app/components/article/share-button', () => ({
  ShareButton: ({ title, url }: { title: string; url: string }) => (
    <button data-testid="share-button" data-title={title} data-url={url}>
      Share
    </button>
  ),
}));

describe('HistoryArticleCard', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockArticle = {
    id: 123,
    title: 'Test Article Title',
    translatedTitle: 'テスト記事タイトル',
    summary: 'This is a test article summary that provides context.',
    url: 'https://example.com/article',
    publishedAt: '2025-12-10T10:00:00.000Z',
    source: {
      id: 1,
      name: 'Zenn',
    },
    tags: [
      { id: 1, name: 'React' },
      { id: 2, name: 'TypeScript' },
      { id: 3, name: 'Next.js' },
    ],
    content: 'A'.repeat(2500), // 2500 chars = 5 min reading time
  };

  const defaultProps = {
    article: mockArticle,
    viewedAt: '2025-12-14T09:30:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (usePathname as jest.Mock).mockReturnValue('/history');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  });

  describe('Rendering', () => {
    it('should render the article card with correct test id', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      expect(screen.getByTestId('history-article-card')).toBeInTheDocument();
    });

    it('should display translated title when available', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      expect(screen.getByText('テスト記事タイトル')).toBeInTheDocument();
    });

    it('should display original title when translated title is not available', () => {
      const propsWithoutTranslation = {
        ...defaultProps,
        article: { ...mockArticle, translatedTitle: null },
      };
      render(<HistoryArticleCard {...propsWithoutTranslation} />);
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    });

    it('should display article summary', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      expect(screen.getByText(mockArticle.summary)).toBeInTheDocument();
    });

    it('should display source name', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      expect(screen.getByTestId('article-source')).toHaveTextContent('Zenn');
    });

    it('should display first 2 tags with +N for remaining', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
      expect(screen.queryByText('Next.js')).not.toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should display reading time and content length', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      // 2500 chars / 500 chars per min = 5 min
      expect(screen.getByText(/5 min/)).toBeInTheDocument();
      expect(screen.getByText(/2,500 chars/)).toBeInTheDocument();
    });

    it('should not display reading time when content is empty', () => {
      const propsWithoutContent = {
        ...defaultProps,
        article: { ...mockArticle, content: null },
      };
      render(<HistoryArticleCard {...propsWithoutContent} />);
      expect(screen.queryByText(/min/)).not.toBeInTheDocument();
    });

    it('should render FavoriteButton with correct article ID', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const favoriteButton = screen.getByTestId('favorite-button');
      expect(favoriteButton).toHaveAttribute('data-article-id', '123');
    });

    it('should render ShareButton with correct props', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const shareButton = screen.getByTestId('share-button');
      expect(shareButton).toHaveAttribute('data-title', 'テスト記事タイトル');
      expect(shareButton).toHaveAttribute('data-url', 'https://example.com/article');
    });
  });

  describe('Navigation', () => {
    it('should navigate to article detail when card is clicked', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const card = screen.getByTestId('history-article-card');
      fireEvent.click(card);
      expect(mockRouter.push).toHaveBeenCalledWith('/articles/123?from=%2Fhistory');
    });

    it('should not navigate when interactive element is clicked', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const favoriteButton = screen.getByTestId('favorite-button');
      fireEvent.click(favoriteButton);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should call onArticleClick when provided', () => {
      const onArticleClick = jest.fn();
      render(<HistoryArticleCard {...defaultProps} onArticleClick={onArticleClick} />);
      const card = screen.getByTestId('history-article-card');
      fireEvent.click(card);
      expect(onArticleClick).toHaveBeenCalledWith(123);
    });
  });

  describe('Tag Click', () => {
    it('should navigate to tag filter when tag is clicked and no onTagClick provided', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const reactTag = screen.getByText('React');
      fireEvent.click(reactTag);
      expect(mockRouter.push).toHaveBeenCalledWith('/?tags=React&tagMode=OR');
    });

    it('should call onTagClick when provided', () => {
      const onTagClick = jest.fn();
      render(<HistoryArticleCard {...defaultProps} onTagClick={onTagClick} />);
      const reactTag = screen.getByText('React');
      fireEvent.click(reactTag);
      expect(onTagClick).toHaveBeenCalledWith('React');
      // Should not navigate when onTagClick is provided
      expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining('tags=React'));
    });
  });

  describe('External Link', () => {
    it('should open external link in new tab when Original button is clicked', () => {
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
      render(<HistoryArticleCard {...defaultProps} />);
      const originalButton = screen.getByRole('button', { name: /open original article/i });
      fireEvent.click(originalButton);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
      windowOpenSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label for viewed at badge', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const viewedAtBadge = screen.getByRole('generic', { name: /viewed/i });
      expect(viewedAtBadge).toBeInTheDocument();
    });

    it('should have proper aria-label for remaining tags count', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const remainingTags = screen.getByLabelText(/1 more tags/i);
      expect(remainingTags).toBeInTheDocument();
    });

    it('should have proper aria-label for external link button', () => {
      render(<HistoryArticleCard {...defaultProps} />);
      const externalLinkButton = screen.getByRole('button', { name: /open original article/i });
      expect(externalLinkButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle article without tags', () => {
      const propsWithoutTags = {
        ...defaultProps,
        article: { ...mockArticle, tags: undefined },
      };
      render(<HistoryArticleCard {...propsWithoutTags} />);
      expect(screen.queryByText('React')).not.toBeInTheDocument();
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });

    it('should handle article with empty tags array', () => {
      const propsWithEmptyTags = {
        ...defaultProps,
        article: { ...mockArticle, tags: [] },
      };
      render(<HistoryArticleCard {...propsWithEmptyTags} />);
      expect(screen.queryByText('React')).not.toBeInTheDocument();
    });

    it('should handle article with only 2 tags (no +N display)', () => {
      const propsWithTwoTags = {
        ...defaultProps,
        article: {
          ...mockArticle,
          tags: [
            { id: 1, name: 'React' },
            { id: 2, name: 'TypeScript' },
          ],
        },
      };
      render(<HistoryArticleCard {...propsWithTwoTags} />);
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });

    it('should handle article without summary', () => {
      const propsWithoutSummary = {
        ...defaultProps,
        article: { ...mockArticle, summary: null },
      };
      render(<HistoryArticleCard {...propsWithoutSummary} />);
      expect(screen.queryByText(mockArticle.summary)).not.toBeInTheDocument();
    });

    it('should use contentLength when provided instead of calculating from content', () => {
      const propsWithContentLength = {
        ...defaultProps,
        article: {
          ...mockArticle,
          contentLength: 5000,
          content: 'A'.repeat(100), // Short content but contentLength is 5000
        },
      };
      render(<HistoryArticleCard {...propsWithContentLength} />);
      // 5000 chars / 500 = 10 min
      expect(screen.getByText(/10 min/)).toBeInTheDocument();
      expect(screen.getByText(/5,000 chars/)).toBeInTheDocument();
    });
  });
});
