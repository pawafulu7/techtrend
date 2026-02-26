import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleCard } from '@/app/components/article/card';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMockArticleWithRelations,
  createMockTag,
  createMockSource,
  mockArticleWithRelations,
} from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/'),
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

jest.mock('@/app/components/common/optimized-image', () => {
  const stripNextImageProps = ({
    priority,
    fill,
    sizes,
    quality,
    loader,
    ...rest
  }: any) => rest;

  const mockImg = ({ src, alt, className, ...rest }: any) => {
    const safeProps = stripNextImageProps(rest);
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={src} alt={alt} className={className} {...safeProps} />;
  };

  return {
    __esModule: true,
    OptimizedImage: mockImg,
    ArticleThumbnail: mockImg,
    ProfileImage: mockImg,
  };
});

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSession = jest.mocked(useSession);

describe('ArticleCard', () => {
  let queryClient: QueryClient;
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
  } as any;

  const mockArticle = createMockArticleWithRelations({
    article: {
      id: '1',
      title: 'Test Article Title',
      summary:
        'This is a test article summary that should be displayed on the card.',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01T10:00:00Z'),
      qualityScore: 85,
      bookmarks: 10,
      userVotes: 5,
    },
    source: {
      name: 'Test Source',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockedUseRouter.mockReturnValue(mockRouter);
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    } as any);
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
  };

  it('renders article information correctly', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    // タイトルが表示される
    expect(screen.getByText('Test Article Title')).toBeInTheDocument();

    // 要約が表示される
    expect(
      screen.getByText(/This is a test article summary/)
    ).toBeInTheDocument();

    // ソース名が表示される
    expect(screen.getByText('Test Source')).toBeInTheDocument();
  });

  it('calls onArticleClick and still navigates when onArticleClick is provided', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    renderWithProviders(
      <ArticleCard article={mockArticle} onArticleClick={handleClick} />
    );

    const card = screen.getByTestId('article-card');
    await user.click(card);

    // onArticleClickが呼ばれる（スクロール位置保存等の副作用用）
    expect(handleClick).toHaveBeenCalled();
    // ナビゲーションも発生する（onArticleClickは副作用フックであり、ナビゲーション代替ではない）
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('navigates to article detail page when clicked without onArticleClick', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ArticleCard article={mockArticle} />);

    const card = screen.getByTestId('article-card');
    await user.click(card);

    // onArticleClick未指定時はデフォルトのナビゲーションが発生する
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('displays favorite button', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    // お気に入りボタンが常に表示される
    expect(screen.getByTestId('favorite-button')).toBeInTheDocument();
  });

  it('renders the article card container', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    // data-testidで確認（role="article"は実装にない）
    const card = screen.getByTestId('article-card');

    // カードが正しくレンダリングされている
    expect(card).toBeInTheDocument();
  });

  it('renders without tags when tags array is empty', () => {
    const articleWithoutTags = {
      ...mockArticle,
      tags: [],
    };

    renderWithProviders(<ArticleCard article={articleWithoutTags} />);

    // タグセクションが存在しないか、空である
    const tagElements = screen.queryAllByTestId('tag-chip');
    expect(tagElements).toHaveLength(0);
  });

  it('displays new badge for articles published within 24 hours', () => {
    const newArticle = {
      ...mockArticle,
      publishedAt: new Date(), // 現在時刻
    };

    renderWithProviders(<ArticleCard article={newArticle} />);

    // NEW インジケーター（パルスドット）が表示される
    expect(screen.getByLabelText('24時間以内の新着記事')).toBeInTheDocument();
  });

  it('does not display new badge for old articles', () => {
    const oldArticle = {
      ...mockArticle,
      publishedAt: new Date('2020-01-01'),
    };

    renderWithProviders(<ArticleCard article={oldArticle} />);

    // NEWインジケーター（パルスドット）が表示されない
    expect(
      screen.queryByLabelText('24時間以内の新着記事')
    ).not.toBeInTheDocument();
  });

  it('displays unread badge when isRead is false', () => {
    renderWithProviders(<ArticleCard article={mockArticle} isRead={false} />);

    // 未読バッジが表示される
    expect(screen.getByText('未読')).toBeInTheDocument();
  });

  it('does not display unread badge when isRead is true', () => {
    renderWithProviders(<ArticleCard article={mockArticle} isRead={true} />);

    // 未読バッジが表示されない
    expect(screen.queryByText('未読')).not.toBeInTheDocument();
  });

  it('displays article thumbnail for Speaker Deck source', () => {
    const speakerDeckArticle = {
      ...mockArticle,
      source: createMockSource({ name: 'Speaker Deck' }),
      thumbnail: 'https://example.com/thumbnail.jpg',
    };

    renderWithProviders(<ArticleCard article={speakerDeckArticle} />);

    // サムネイル画像が表示される
    const thumbnail = screen.getByRole('img', {
      name: speakerDeckArticle.title,
    });
    expect(thumbnail).toBeInTheDocument();
    expect(thumbnail).toHaveAttribute(
      'src',
      expect.stringContaining('thumbnail.jpg')
    );
  });

  it('displays summary when no thumbnail is shown', () => {
    const articleWithSummary = {
      ...mockArticle,
      thumbnail: null,
      source: createMockSource({ name: 'Dev.to' }),
      content: 'Long content that is more than 300 characters. '.repeat(10),
    };

    renderWithProviders(<ArticleCard article={articleWithSummary} />);

    // 要約が表示される
    expect(
      screen.getByText(/This is a test article summary/)
    ).toBeInTheDocument();
  });

  it('displays vote count badge when userVotes > 0', () => {
    const articleWithVotes = {
      ...mockArticle,
      userVotes: 5,
    };

    renderWithProviders(<ArticleCard article={articleWithVotes} />);

    // 投票数バッジが表示される
    expect(screen.getByTestId('vote-count-badge')).toBeInTheDocument();
    expect(screen.getByTestId('vote-count-badge')).toHaveTextContent('5');
  });

  it('does not display vote count badge when userVotes is 0', () => {
    const articleNoVotes = {
      ...mockArticle,
      userVotes: 0,
    };

    renderWithProviders(<ArticleCard article={articleNoVotes} />);

    // 投票数バッジが表示されない
    expect(screen.queryByTestId('vote-count-badge')).not.toBeInTheDocument();
  });

  it('renders card correctly with quality score data', () => {
    const articleWithScore = {
      ...mockArticle,
      qualityScore: 85,
    };

    renderWithProviders(<ArticleCard article={articleWithScore} />);

    // カードが正常にレンダリングされる（品質スコアはカード内に直接表示されない）
    expect(screen.getByTestId('article-card')).toBeInTheDocument();
    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
  });

  it('renders card correctly with category data', () => {
    const articleWithCategory = {
      ...mockArticle,
      category: 'frontend',
    };

    renderWithProviders(<ArticleCard article={articleWithCategory} />);

    // カードが正常にレンダリングされる（カテゴリはカード内に直接表示されない）
    expect(screen.getByTestId('article-card')).toBeInTheDocument();
    expect(screen.getByText('Test Article Title')).toBeInTheDocument();
  });

  it('displays absolute date for publication date', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    expect(screen.getByText('公開:')).toBeInTheDocument();
    // formatDateWithTime outputs "YYYY/MM/DD HH:MM" in JST
    // mockArticle.publishedAt = 2025-01-01T10:00:00Z = 2025/01/01 19:00 JST
    const dateSpans = screen.getAllByText(/\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}/);
    expect(dateSpans.length).toBeGreaterThanOrEqual(1);
  });

  it('renders external link button with icon only', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    const externalLinkButton = screen.getByLabelText('元記事を開く');
    expect(externalLinkButton).toBeInTheDocument();
  });

  it('does not open external link with javascript: URL', async () => {
    const user = userEvent.setup();
    const dangerousArticle = {
      ...mockArticle,
      url: 'javascript:alert(1)',
    };
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    renderWithProviders(<ArticleCard article={dangerousArticle} />);

    const externalLinkButton = screen.getByLabelText('元記事を開く');
    await user.click(externalLinkButton);

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('applies design system card-hover styling', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    const card = screen.getByTestId('article-card');

    // CardV2コンポーネントのデザインシステムクラスが適用されている
    expect(card).toHaveClass('card-hover');
    expect(card).toBeInTheDocument();
  });

  it('handles articles with very long titles gracefully', () => {
    const longTitleArticle = {
      ...mockArticle,
      title:
        'This is an extremely long title that should be truncated properly in the UI to maintain good visual appearance and user experience. It should not break the layout of the card component and should display with ellipsis at the end.',
    };

    renderWithProviders(<ArticleCard article={longTitleArticle} />);

    const titleElement = screen.getByText(/This is an extremely long title/i);
    expect(titleElement).toBeInTheDocument();
    // タイトルは適切にレンダリングされている
    expect(titleElement).toHaveClass('font-semibold');
  });

  it('correctly handles missing optional fields', () => {
    const minimalArticle = createMockArticleWithRelations({
      article: {
        id: '1',
        title: 'Minimal Article',
        summary: null,
        thumbnail: null,
        qualityScore: null,
        bookmarks: null,
        userVotes: null,
        category: null,
      },
      tags: [],
    });

    renderWithProviders(<ArticleCard article={minimalArticle} />);

    // タイトルは表示される
    expect(screen.getByText('Minimal Article')).toBeInTheDocument();
    // カードは正常にレンダリングされる
    expect(screen.getByTestId('article-card')).toBeInTheDocument();
  });

  describe('source property validation', () => {
    it('renders article card with source property correctly', () => {
      const articleWithSource = createMockArticleWithRelations({
        article: {
          title: 'Article with Source',
        },
        source: createMockSource({ name: 'Test Source' }),
      });

      renderWithProviders(<ArticleCard article={articleWithSource} />);

      // ArticleCardが正常にレンダリングされることを確認
      expect(screen.getByTestId('article-card')).toBeInTheDocument();
      expect(screen.getByText('Article with Source')).toBeInTheDocument();
      expect(screen.getByText('Test Source')).toBeInTheDocument();
    });

    it.each([
      { name: 'Speaker Deck', title: 'Speaker Deck Presentation' },
      { name: 'Docswell', title: 'Docswell Presentation' },
    ])('handles $name articles with source correctly', ({ name, title }) => {
      const thumbnailUrl = 'https://example.com/thumb.jpg';
      const article = createMockArticleWithRelations({
        article: {
          title,
          thumbnail: thumbnailUrl,
        },
        source: createMockSource({ name }),
      });

      renderWithProviders(<ArticleCard article={article} />);

      // 記事が正しくレンダリングされる
      expect(screen.getByTestId('article-card')).toBeInTheDocument();
      // サムネイルが表示される（shouldShowThumbnail関数の動作確認）
      const thumbnail = screen.getByRole('img', { name: title });
      expect(thumbnail).toBeInTheDocument();
      // 正しいサムネイルURLが使用されている
      expect(thumbnail).toHaveAttribute(
        'src',
        expect.stringContaining('thumb.jpg')
      );
    });

    it('displays source name when available', () => {
      const articleWithSource = createMockArticleWithRelations({
        article: {
          title: 'Article with Source Name',
        },
        source: createMockSource({ name: 'Custom Source' }),
      });

      renderWithProviders(<ArticleCard article={articleWithSource} />);

      // ソース名が表示される（実装によってはBadgeやテキストで表示）
      expect(screen.getByText('Custom Source')).toBeInTheDocument();
    });

    it.each([{ name: 'Speaker Deck' }, { name: 'Docswell' }])(
      'does not render thumbnail when $name article has no thumbnail',
      ({ name }) => {
        const article = createMockArticleWithRelations({
          article: {
            title: `${name} without thumbnail`,
            thumbnail: null,
            summary:
              'This is a test article summary that should be displayed on the card.',
          },
          source: createMockSource({ name }),
        });

        renderWithProviders(<ArticleCard article={article} />);

        // サムネイルが表示されないことを確認
        const thumbnail = screen.queryByRole('img', {
          name: `${name} without thumbnail`,
        });
        expect(thumbnail).not.toBeInTheDocument();
        // 代わりに要約が表示されることを確認
        expect(
          screen.getByText(/This is a test article summary/)
        ).toBeInTheDocument();
      }
    );
  });

  describe('thumbnail display logic (T1: simplified)', () => {
    it('shows thumbnail whenever article has thumbnail set', () => {
      const articleWithThumbnail = createMockArticleWithRelations({
        article: {
          id: 'thumb-1',
          title: 'Article With Thumbnail',
          thumbnail: 'https://example.com/thumbnail.jpg',
          summary: 'This summary should also be displayed alongside thumbnail',
          content: 'Long content that exceeds 300 characters. '.repeat(20),
        },
        source: createMockSource({ name: 'Hugging Face Papers' }),
      });

      renderWithProviders(<ArticleCard article={articleWithThumbnail} />);

      // サムネイルが表示される（thumbnailが存在すれば常に表示）
      expect(
        screen.getByRole('img', { name: 'Article With Thumbnail' })
      ).toBeInTheDocument();

      // 要約も表示される（Pattern 2: thumbnail + short summary）
      expect(
        screen.getByText(/This summary should also be displayed/)
      ).toBeInTheDocument();
    });

    it('shows full summary when no thumbnail exists', () => {
      const article = createMockArticleWithRelations({
        article: {
          id: 'no-thumb-1',
          title: 'No Thumbnail Article',
          thumbnail: null,
          summary:
            'Summary for article without thumbnail that should be fully displayed',
        },
        source: createMockSource({ name: 'arXiv' }),
      });

      renderWithProviders(<ArticleCard article={article} />);

      // サムネイルが表示されない
      expect(
        screen.queryByRole('img', { name: 'No Thumbnail Article' })
      ).not.toBeInTheDocument();

      // 要約が表示される（Pattern 3: full summary）
      expect(
        screen.getByText(
          'Summary for article without thumbnail that should be fully displayed'
        )
      ).toBeInTheDocument();
    });

    it('uses object-contain for thumbnail display', () => {
      const articleWithThumbnail = createMockArticleWithRelations({
        article: {
          title: 'Article With Slides',
          thumbnail: 'https://example.com/slide.jpg',
        },
        source: createMockSource({ name: 'Speaker Deck' }),
      });

      renderWithProviders(<ArticleCard article={articleWithThumbnail} />);

      const thumbnail = screen.getByRole('img', {
        name: 'Article With Slides',
      });
      expect(thumbnail).toHaveClass('object-contain');
    });

    it('applies object-contain to Pattern 2 thumbnail (non-presentation)', () => {
      const regularArticle = createMockArticleWithRelations({
        article: {
          title: 'Regular Article',
          thumbnail: 'https://example.com/ogp.jpg',
          summary: 'Short summary',
        },
        source: createMockSource({ name: 'Qiita' }),
      });

      renderWithProviders(<ArticleCard article={regularArticle} />);

      const thumbnail = screen.getByRole('img', { name: 'Regular Article' });
      expect(thumbnail).toHaveClass('object-contain');
    });

    it('shows title alongside thumbnail', () => {
      const articleWithThumbnail = createMockArticleWithRelations({
        article: {
          title: 'Article Title With Thumbnail',
          thumbnail: 'https://example.com/slide.jpg',
        },
        source: createMockSource({ name: 'Speaker Deck' }),
      });

      renderWithProviders(<ArticleCard article={articleWithThumbnail} />);

      // サムネイル付きでもタイトルが表示される
      expect(
        screen.getByText('Article Title With Thumbnail')
      ).toBeInTheDocument();
    });
  });
});
