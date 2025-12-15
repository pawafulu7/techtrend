import { render, screen, fireEvent } from '@testing-library/react';
import { FavoriteArticleCard, FavoriteCardSkeleton, FavoriteSkeletonGrid } from '@/app/components/article/favorite-card';
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
  FavoriteButton: ({
    articleId,
    isFavorited,
    onToggleFavorite,
  }: {
    articleId: string;
    isFavorited: boolean;
    onToggleFavorite?: () => void;
  }) => (
    <button
      data-testid="favorite-button"
      data-article-id={articleId}
      data-is-favorited={isFavorited}
      onClick={onToggleFavorite}
    >
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

describe('FavoriteArticleCard', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockArticle = {
    id: 'cltest123abc',
    title: 'Test Article Title',
    translatedTitle: 'Translated Title',
    summary: 'This is a test article summary.',
    url: 'https://example.com/article',
    publishedAt: '2025-12-10T10:00:00.000Z',
    source: {
      id: 'clsource1',
      name: 'Hugging Face Papers',
    },
    companyName: null,
    tags: [
      { id: 'cltag1', name: 'AI' },
      { id: 'cltag2', name: 'LLM' },
      { id: 'cltag3', name: 'Deep Learning' },
    ],
    content: 'A'.repeat(2500), // 2500 chars = 5 min reading time
    contentLength: 2500,
    favoriteId: 'clfav123',
    favoritedAt: '2025-12-14T09:30:00.000Z',
    qualityScore: null,
  };

  const defaultProps = {
    article: mockArticle,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    (usePathname as jest.Mock).mockReturnValue('/favorites');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  });

  describe('Rendering', () => {
    it('should render the article card with correct test id', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      expect(screen.getByTestId('favorite-article-card')).toBeInTheDocument();
    });

    it('should display translated title when available', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      expect(screen.getByText('Translated Title')).toBeInTheDocument();
    });

    it('should display original title when translated title is not available', () => {
      const propsWithoutTranslation = {
        ...defaultProps,
        article: { ...mockArticle, translatedTitle: null },
      };
      render(<FavoriteArticleCard {...propsWithoutTranslation} />);
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    });

    it('should display article summary', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      expect(screen.getByText(mockArticle.summary)).toBeInTheDocument();
    });

    it('should display source name', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      expect(screen.getByTestId('article-source')).toHaveTextContent('Hugging Face Papers');
    });

    it('should display first 2 tags with +N for remaining', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      expect(screen.getByText('AI')).toBeInTheDocument();
      expect(screen.getByText('LLM')).toBeInTheDocument();
      expect(screen.queryByText('Deep Learning')).not.toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should display reading time and content length', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      // 2500 chars / 500 chars per min = 5 min
      // Format: "5分 / 2,500文字"
      expect(screen.getByText(/5分/)).toBeInTheDocument();
      expect(screen.getByText(/2,500文字/)).toBeInTheDocument();
    });

    it('should render FavoriteButton with isFavorited=true', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const favoriteButton = screen.getByTestId('favorite-button');
      expect(favoriteButton).toHaveAttribute('data-article-id', 'cltest123abc');
      expect(favoriteButton).toHaveAttribute('data-is-favorited', 'true');
    });

    it('should render ShareButton with correct props', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const shareButton = screen.getByTestId('share-button');
      expect(shareButton).toHaveAttribute('data-title', 'Translated Title');
      expect(shareButton).toHaveAttribute('data-url', 'https://example.com/article');
    });

    it('should display favorited at time', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      // favoritedAt badge should be present (shows relative time)
      const timeBadges = screen.getAllByRole('time');
      expect(timeBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Navigation', () => {
    it('should navigate to article detail when card is clicked', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const card = screen.getByTestId('favorite-article-card');
      fireEvent.click(card);
      expect(mockRouter.push).toHaveBeenCalledWith('/articles/cltest123abc?from=%2Ffavorites');
    });

    it('should not navigate when interactive element is clicked', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const favoriteButton = screen.getByTestId('favorite-button');
      fireEvent.click(favoriteButton);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should call onArticleClick when provided', () => {
      const onArticleClick = jest.fn();
      render(<FavoriteArticleCard {...defaultProps} onArticleClick={onArticleClick} />);
      const card = screen.getByTestId('favorite-article-card');
      fireEvent.click(card);
      expect(onArticleClick).toHaveBeenCalledWith('cltest123abc');
    });
  });

  describe('Tag Click', () => {
    it('should navigate to tag filter when tag is clicked and no onTagClick provided', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const aiTag = screen.getByText('AI');
      fireEvent.click(aiTag);
      expect(mockRouter.push).toHaveBeenCalledWith('/?tags=AI&tagMode=OR');
    });

    it('should call onTagClick when provided', () => {
      const onTagClick = jest.fn();
      render(<FavoriteArticleCard {...defaultProps} onTagClick={onTagClick} />);
      const aiTag = screen.getByText('AI');
      fireEvent.click(aiTag);
      expect(onTagClick).toHaveBeenCalledWith('AI');
    });
  });

  describe('Remove Favorite', () => {
    it('should call onRemoveFavorite when favorite button is clicked', () => {
      const onRemoveFavorite = jest.fn();
      render(<FavoriteArticleCard {...defaultProps} onRemoveFavorite={onRemoveFavorite} />);
      const favoriteButton = screen.getByTestId('favorite-button');
      fireEvent.click(favoriteButton);
      expect(onRemoveFavorite).toHaveBeenCalledWith('cltest123abc');
    });
  });

  describe('External Link', () => {
    it('should open external link in new tab when Original button is clicked', () => {
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();
      render(<FavoriteArticleCard {...defaultProps} />);
      const externalLinkButton = screen.getByLabelText(/元記事を新しいタブで開く/);
      fireEvent.click(externalLinkButton);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
      windowOpenSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label for favorited at badge', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const favoritedAtBadge = screen.getByLabelText(/保存:/);
      expect(favoritedAtBadge).toBeInTheDocument();
    });

    it('should have proper aria-label for remaining tags count', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const remainingTags = screen.getByLabelText(/他1件のタグ/);
      expect(remainingTags).toBeInTheDocument();
    });

    it('should have proper aria-label for external link button', () => {
      render(<FavoriteArticleCard {...defaultProps} />);
      const externalLinkButton = screen.getByRole('button', { name: /元記事を新しいタブで開く/ });
      expect(externalLinkButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle article without tags', () => {
      const propsWithoutTags = {
        ...defaultProps,
        article: { ...mockArticle, tags: undefined },
      };
      render(<FavoriteArticleCard {...propsWithoutTags} />);
      expect(screen.queryByText('AI')).not.toBeInTheDocument();
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });

    it('should handle article with empty tags array', () => {
      const propsWithEmptyTags = {
        ...defaultProps,
        article: { ...mockArticle, tags: [] },
      };
      render(<FavoriteArticleCard {...propsWithEmptyTags} />);
      expect(screen.queryByText('AI')).not.toBeInTheDocument();
    });

    it('should handle article with only 2 tags (no +N display)', () => {
      const propsWithTwoTags = {
        ...defaultProps,
        article: {
          ...mockArticle,
          tags: [
            { id: 'cltag1', name: 'AI' },
            { id: 'cltag2', name: 'LLM' },
          ],
        },
      };
      render(<FavoriteArticleCard {...propsWithTwoTags} />);
      expect(screen.getByText('AI')).toBeInTheDocument();
      expect(screen.getByText('LLM')).toBeInTheDocument();
      expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
    });

    it('should handle article without summary', () => {
      const propsWithoutSummary = {
        ...defaultProps,
        article: { ...mockArticle, summary: null },
      };
      render(<FavoriteArticleCard {...propsWithoutSummary} />);
      expect(screen.queryByText(mockArticle.summary)).not.toBeInTheDocument();
    });

    it('should display companyName when provided instead of source name', () => {
      const propsWithCompany = {
        ...defaultProps,
        article: { ...mockArticle, companyName: 'OpenAI' },
      };
      render(<FavoriteArticleCard {...propsWithCompany} />);
      expect(screen.getByTestId('article-source')).toHaveTextContent('OpenAI');
    });
  });
});

describe('FavoriteCardSkeleton', () => {
  it('should render skeleton with loading status', () => {
    render(<FavoriteCardSkeleton />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('aria-label', '読み込み中');
  });
});

describe('FavoriteSkeletonGrid', () => {
  it('should render 8 skeleton cards plus grid container', () => {
    render(<FavoriteSkeletonGrid />);
    // 8 skeleton cards + 1 grid container = 9 elements with role="status"
    const skeletons = screen.getAllByRole('status');
    expect(skeletons).toHaveLength(9);
  });

  it('should have proper aria attributes on grid container', () => {
    render(<FavoriteSkeletonGrid />);
    const grid = screen.getByRole('status', { name: /お気に入りを読み込み中/ });
    expect(grid).toBeInTheDocument();
  });

  it('should render individual skeleton cards with proper aria-label', () => {
    render(<FavoriteSkeletonGrid />);
    const skeletonCards = screen.getAllByLabelText('読み込み中');
    expect(skeletonCards).toHaveLength(8);
  });
});
