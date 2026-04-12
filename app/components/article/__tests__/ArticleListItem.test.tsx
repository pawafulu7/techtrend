import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleListItem } from '@/app/components/article/list-item';
import { useSession } from '@/lib/auth/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
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

// Next/Imageモック
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
    return <img {...props} />;
  },
}));

// FavoriteButtonモック
jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: ({ articleId }: { articleId: string }) => (
    <button data-testid="favorite-button">Favorite {articleId}</button>
  ),
}));

describe('ArticleListItem', () => {
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  const mockSearchParams = new URLSearchParams();

  const mockArticle = createMockArticleWithRelations({
    article: {
      id: '1',
      title: 'Test Article Title',
      summary:
        'This is a test article summary that should be displayed in the list item.',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01T10:00:00Z'),
      createdAt: new Date('2025-01-01T11:00:00Z'),
      qualityScore: 85,
      bookmarks: 10,
      userVotes: 5,
    },
    tags: [
      { name: 'React', id: 'tag-1' },
      { name: 'Testing', id: 'tag-2' },
      { name: 'JavaScript', id: 'tag-3' },
      { name: 'TypeScript', id: 'tag-4' },
    ],
    source: {
      id: 'source-1',
      name: 'Test Source',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      isPending: false,
    });

    // window.locationのモック（jsdom互換の方法）
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        href: '',
        origin: 'http://localhost',
        assign: jest.fn(),
        replace: jest.fn(),
        reload: jest.fn(),
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('記事情報を正しく表示する', () => {
      render(<ArticleListItem article={mockArticle} />);

      // タイトルが表示される
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();

      // 要約が表示される
      expect(
        screen.getByText(/This is a test article summary/)
      ).toBeInTheDocument();

      // ソース名が表示される
      expect(screen.getByText('Test Source')).toBeInTheDocument();

      // タグが表示される（最大3つ、デスクトップのみ）
      const tags = screen.queryAllByText(/React|Testing|JavaScript/);
      expect(tags.length).toBeGreaterThan(0);
    });

    it('新着記事バッジを24時間以内の記事に表示する', () => {
      const newArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          publishedAt: new Date(), // 現在時刻
        },
      });

      render(<ArticleListItem article={newArticle} />);

      // Newバッジが表示される
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('未読バッジを未読記事に表示する', () => {
      render(<ArticleListItem article={mockArticle} isRead={false} />);

      // 未読バッジが表示される
      expect(screen.getByText('未読')).toBeInTheDocument();
    });

    it('既読記事では未読バッジを表示しない', () => {
      render(<ArticleListItem article={mockArticle} isRead={true} />);

      // 未読バッジが表示されない
      expect(screen.queryByText('未読')).not.toBeInTheDocument();
    });
  });

  describe('インタラクション', () => {
    it('記事クリック時にコールバックを実行する', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <ArticleListItem article={mockArticle} onArticleClick={handleClick} />
      );

      const listItem = screen
        .getByText('Test Article Title')
        .closest('div[class*="group"]');
      await user.click(listItem!);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('タグクリック時にカスタムハンドラーを実行する', async () => {
      const handleTagClick = jest.fn();
      const user = userEvent.setup();

      render(
        <ArticleListItem article={mockArticle} onTagClick={handleTagClick} />
      );

      const reactTag = screen.getByText('React');
      await user.click(reactTag);

      expect(handleTagClick).toHaveBeenCalledWith('React');
    });

    it('外部リンクボタンをクリックすると新しいタブで開く', async () => {
      const user = userEvent.setup();
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<ArticleListItem article={mockArticle} />);

      // まずホバーしてボタンを表示
      const listItem = screen
        .getByText('Test Article Title')
        .closest('div[class*="group"]');
      await user.hover(listItem!);

      const externalLinkButton = screen.getByTitle('元記事を開く');
      await user.click(externalLinkButton);

      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });

  describe('表示要素のバリエーション', () => {
    it('3つを超えるタグは最初の3つのみ表示する', () => {
      render(<ArticleListItem article={mockArticle} />);

      // 最初の3つのタグが表示される
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Testing')).toBeInTheDocument();
      expect(screen.getByText('JavaScript')).toBeInTheDocument();

      // 4つ目のタグは表示されない
      expect(screen.queryByText('TypeScript')).not.toBeInTheDocument();
    });

    it('タグがない場合はタグセクションを表示しない', () => {
      const articleWithoutTags = createMockArticleWithRelations({
        article: mockArticle,
        tags: [],
      });

      render(<ArticleListItem article={articleWithoutTags} />);

      // タグセクションが存在しない
      const badges = screen.queryAllByRole('button', {
        name: /React|Testing|JavaScript/,
      });
      expect(badges).toHaveLength(0);
    });

    it('要約がない場合でも正常にレンダリングする', () => {
      const articleWithoutSummary = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          summary: null,
        },
      });

      render(<ArticleListItem article={articleWithoutSummary} />);

      // タイトルは表示される
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
      // 要約セクションは表示されない
      expect(
        screen.queryByText(/This is a test article summary/)
      ).not.toBeInTheDocument();
    });
  });

  describe('レスポンシブ表示', () => {
    it('デスクトップではタグと詳細な時間情報を表示する', () => {
      render(<ArticleListItem article={mockArticle} />);

      // タグが表示される（hidden sm:flex クラス）
      const tagContainer = screen.getByText('React').closest('div');
      expect(tagContainer).toHaveClass('hidden sm:flex');

      // 配信・取込時刻が両方表示される（hidden sm:flex クラス）
      expect(screen.getByText('📅')).toBeInTheDocument();
      expect(screen.getByText('📥')).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('ホバー時にスタイルが変更される', () => {
      render(<ArticleListItem article={mockArticle} />);

      const listItem = screen
        .getByText('Test Article Title')
        .closest('div[class*="group"]');

      // ホバー関連のクラスが適用されている
      expect(listItem).toHaveClass('hover:bg-gray-50');
      expect(listItem).toHaveClass('hover:shadow-sm');
      expect(listItem).toHaveClass('cursor-pointer');
    });

    it('ダークモード対応のクラスがある', () => {
      render(<ArticleListItem article={mockArticle} />);

      const listItem = screen
        .getByText('Test Article Title')
        .closest('div[class*="group"]');

      // ダークモード対応クラス
      expect(listItem).toHaveClass('dark:bg-gray-800/50');
      expect(listItem).toHaveClass('dark:hover:bg-gray-700/50');
    });
  });
});
