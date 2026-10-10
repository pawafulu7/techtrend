import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleCard } from '@/app/components/article/card';
import { useSession } from '@/lib/auth/auth-client';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMockArticleWithRelations,
  createMockTag,
  createMockSource,
  mockArticleWithRelations,
} from '@/test/utils/mock-factories';
import { findPaletteColorClasses } from '@/test/utils/palette-classes';

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
      isPending: false,
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

    // card-with-link: タイトルが実リンク。onArticleClick は副作用フックであり
    // ナビゲーションの代替ではない（遷移は <a href> としてブラウザが担う）
    const link = screen.getByTestId('article-title-link');
    await user.click(link);

    expect(handleClick).toHaveBeenCalled();
    expect(link.getAttribute('href')).toContain('/articles/');
  });

  it('links to the article detail page, carrying the current list as the return target', () => {
    renderWithProviders(<ArticleCard article={mockArticle} />);

    const link = screen.getByTestId('article-title-link');
    const href = link.getAttribute('href') as string;

    expect(link.tagName).toBe('A');
    expect(href).toContain(`/articles/${mockArticle.id}`);
    // 戻り先は現在の一覧（`/` 固定ではない）
    const from = decodeURIComponent(
      new URL(`http://localhost${href}`).searchParams.get('from') as string
    );
    expect(from).toContain('returning=1');
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

    const { container } = renderWithProviders(
      <ArticleCard article={newArticle} />
    );

    // 「新着」の文字で出し、点滅はさせない
    expect(screen.getByTestId('new-label')).toHaveTextContent('新着');
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('does not display new badge for old articles', () => {
    const oldArticle = {
      ...mockArticle,
      publishedAt: new Date('2020-01-01'),
    };

    renderWithProviders(<ArticleCard article={oldArticle} />);

    // 「新着」の印が表示されない
    expect(screen.queryByTestId('new-label')).not.toBeInTheDocument();
  });

  it('displays unread badge when isRead is false', () => {
    renderWithProviders(<ArticleCard article={mockArticle} isRead={false} />);

    // 未読の点が表示される
    expect(screen.getByRole('img', { name: '未読' })).toBeInTheDocument();
  });

  it('does not display unread badge when isRead is true', () => {
    renderWithProviders(<ArticleCard article={mockArticle} isRead={true} />);

    // 未読の点が表示されない
    expect(screen.queryByRole('img', { name: '未読' })).not.toBeInTheDocument();
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

    // Calendar icon with sr-only label (matching article detail page)
    expect(screen.getByText('公開日:')).toBeInTheDocument();
    // formatDateWithTime outputs "YYYY/MM/DD HH:MM" in JST
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

  it('does not color the card by source (only brand/state tokens)', () => {
    const { container } = renderWithProviders(
      <ArticleCard
        article={{
          ...mockArticle,
          source: createMockSource({ name: 'Qiita' }),
          publishedAt: new Date(),
        }}
        isRead={false}
      />
    );

    expect(findPaletteColorClasses(container)).toEqual([]);
    expect(screen.getByTestId('article-source')).toHaveTextContent('Qiita');
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
    // テキストはタイトルリンク内にあり、省略スタイルは見出し側が持つ
    // 大きさ・太さはスケールの text-h3 が持つ（Issue #699）
    expect(screen.getByTestId('article-title')).toHaveClass(
      'text-h3',
      'line-clamp-2'
    );
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

      // 要約が表示される
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

    it('crops photo thumbnails to fill the 16:9 frame in the grid (object-cover)', () => {
      const regularArticle = createMockArticleWithRelations({
        article: {
          title: 'Regular Article',
          thumbnail: 'https://example.com/ogp.jpg',
          summary: 'Short summary',
        },
        source: createMockSource({ name: 'Qiita' }),
      });

      renderWithProviders(
        <ArticleCard article={regularArticle} layout="grid" />
      );

      const thumbnail = screen.getByRole('img', { name: 'Regular Article' });
      expect(thumbnail).toHaveClass('object-cover');
      expect(thumbnail.parentElement).toHaveClass('aspect-video');
    });

    it('keeps slides collected via Hatena Bookmark uncropped (judged by URL host)', () => {
      const slideViaHatena = createMockArticleWithRelations({
        article: {
          title: 'Slide via Hatena',
          url: 'https://speakerdeck.com/someone/slides',
          thumbnail: 'https://example.com/slide.jpg',
        },
        source: createMockSource({ name: 'はてなブックマーク' }),
      });

      renderWithProviders(
        <ArticleCard article={slideViaHatena} layout="grid" />
      );

      expect(screen.getByRole('img', { name: 'Slide via Hatena' })).toHaveClass(
        'object-contain'
      );
    });

    it('fits the whole image in a 12rem frame and keeps the actions visible when stacked in one column', () => {
      const article = createMockArticleWithRelations({
        article: {
          title: 'Stacked',
          thumbnail: 'https://example.com/ogp.jpg',
        },
        source: createMockSource({ name: 'Qiita' }),
      });

      // 既定の layout は 'stack'（お気に入りフィード・ソース詳細の1列表示）
      renderWithProviders(<ArticleCard article={article} />);

      const thumbnail = screen.getByRole('img', { name: 'Stacked' });
      expect(thumbnail).toHaveClass('object-contain');
      expect(thumbnail.parentElement).toHaveClass('h-48');
      expect(thumbnail.parentElement).not.toHaveClass('aspect-video');
      const actions = screen.getByTestId('article-actions');
      expect(actions).not.toHaveClass('sm:[@media(hover:hover)]:absolute');
      expect(actions).not.toHaveClass('sm:[@media(hover:hover)]:opacity-0');
    });

    it('shows a placeholder in the same 16:9 frame when thumbnailPlaceholder is set', () => {
      const article = createMockArticleWithRelations({
        article: { title: 'No Image', thumbnail: null },
        source: createMockSource({ name: 'Hacker News' }),
      });

      renderWithProviders(
        <ArticleCard article={article} layout="grid" thumbnailPlaceholder />
      );

      const placeholder = screen.getByTestId('thumbnail-placeholder');
      expect(placeholder).toHaveClass('aspect-video');
      // 1列表示（幅 sm 未満）では出さない
      expect(placeholder).toHaveClass('hidden', 'sm:flex');
      expect(placeholder).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('img', { name: 'No Image' })).toBeNull();
      // 枠があるので、複数列のマウス端末では操作ボタンを枠に重ねる
      const actions = screen.getByTestId('article-actions');
      expect(actions).toHaveClass('sm:[@media(hover:hover)]:absolute');
    });

    it('omits the placeholder in the grid unless requested and keeps the actions in the card flow', () => {
      const article = createMockArticleWithRelations({
        article: { title: 'No Image', thumbnail: null },
        source: createMockSource({ name: 'arXiv AI' }),
      });

      renderWithProviders(<ArticleCard article={article} layout="grid" />);

      expect(screen.queryByTestId('thumbnail-placeholder')).toBeNull();
      // 重ねる枠が無いので、マウス端末でも隠さず下端に出す（タイトルを隠さない）
      const actions = screen.getByTestId('article-actions');
      expect(actions).not.toHaveClass('sm:[@media(hover:hover)]:absolute');
      expect(actions).not.toHaveClass('sm:[@media(hover:hover)]:opacity-0');
    });

    it('overlays the actions on the thumbnail frame for mouse devices', () => {
      const article = createMockArticleWithRelations({
        article: {
          title: 'With Image',
          thumbnail: 'https://example.com/ogp.jpg',
        },
        source: createMockSource({ name: 'Qiita' }),
      });

      renderWithProviders(<ArticleCard article={article} layout="grid" />);

      const actions = screen.getByTestId('article-actions');
      // 複数列のマウス端末だけ重ねて隠す（隠しているあいだは押せない）。1列とタッチ端末では下端に常に出す
      expect(actions).toHaveClass('sm:[@media(hover:hover)]:absolute');
      expect(actions).toHaveClass('sm:[@media(hover:hover)]:opacity-0');
      expect(actions).toHaveClass(
        'sm:[@media(hover:hover)]:pointer-events-none'
      );
      expect(actions).not.toHaveClass('[@media(hover:hover)]:opacity-0');
    });

    it('shows a new thumbnail after the previous one failed to load', () => {
      const article = createMockArticleWithRelations({
        article: {
          title: 'Swap',
          thumbnail: 'https://example.com/broken.jpg',
        },
        source: createMockSource({ name: 'Qiita' }),
      });

      const { rerender } = renderWithProviders(
        <ArticleCard article={article} />
      );
      fireEvent.error(screen.getByRole('img', { name: 'Swap' }));
      expect(screen.queryByRole('img', { name: 'Swap' })).toBeNull();

      // 再取得で同じカードに別の画像が届いたら、失敗の状態を引きずらずに出す
      rerender(
        <QueryClientProvider client={queryClient}>
          <ArticleCard
            article={{ ...article, thumbnail: 'https://example.com/ok.jpg' }}
          />
        </QueryClientProvider>
      );
      expect(screen.getByRole('img', { name: 'Swap' })).toHaveAttribute(
        'src',
        'https://example.com/ok.jpg'
      );
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
