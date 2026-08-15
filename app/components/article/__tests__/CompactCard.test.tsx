import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CompactCard } from '@/app/components/article/compact-card';
import { useRouter, useSearchParams } from 'next/navigation';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(),
}));

// FavoriteButtonモック
jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: ({
    articleId,
    isFavorited,
    onToggleFavorite,
  }: {
    articleId: string;
    isFavorited?: boolean;
    onToggleFavorite?: () => void;
  }) => (
    <button
      data-testid="favorite-button"
      data-is-favorited={isFavorited}
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite?.();
      }}
    >
      Favorite {articleId}
    </button>
  ),
}));

describe('CompactCard', () => {
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  const mockSearchParams = new URLSearchParams();

  const mockArticle = createMockArticleWithRelations({
    article: {
      id: '1',
      title: 'Test Article Title',
      summary: 'This is a test article summary that should NOT be displayed.',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01T10:00:00Z'),
      createdAt: new Date('2025-01-01T11:00:00Z'),
      qualityScore: 85,
      bookmarks: 10,
      userVotes: 5,
      thumbnail: null,
      content: 'Full content of the article',
    },
    tags: [
      { name: 'React', id: 'tag-1' },
      { name: 'Testing', id: 'tag-2' },
      { name: 'JavaScript', id: 'tag-3' },
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('タイトルを正しく表示する', () => {
      render(<CompactCard article={mockArticle} />);

      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
    });

    it('要約を表示しない（コンパクト表示の特徴）', () => {
      render(<CompactCard article={mockArticle} />);

      expect(
        screen.queryByText(/This is a test article summary/)
      ).not.toBeInTheDocument();
    });

    it('ソース名を表示する', () => {
      render(<CompactCard article={mockArticle} />);

      expect(screen.getByText('Test Source')).toBeInTheDocument();
    });

    it('最初のタグと残りのカウントを表示する', () => {
      render(<CompactCard article={mockArticle} />);

      // 最初のタグのみ表示
      expect(screen.getByText('React')).toBeInTheDocument();
      // 残りの数を表示
      expect(screen.getByText('+2')).toBeInTheDocument();
      // 2番目以降のタグは表示されない
      expect(screen.queryByText('Testing')).not.toBeInTheDocument();
      expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    });

    it('お気に入りボタンを表示する', () => {
      render(<CompactCard article={mockArticle} />);

      expect(screen.getByTestId('favorite-button')).toBeInTheDocument();
    });

    it('配信日時と取り込み日時を表示する', () => {
      render(<CompactCard article={mockArticle} />);

      // formatDateWithTimeの出力を確認（日時フォーマットされた文字列が存在することを確認）
      // mockArticleのpublishedAt: 2025-01-01T10:00:00Z, createdAt: 2025-01-01T11:00:00Z
      const timestampElements = screen.getAllByText(/2025/);
      expect(timestampElements.length).toBeGreaterThanOrEqual(2);
    });

    it('文字数と読了時間を表示する', () => {
      const articleWithContent = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          contentLength: 2500,
        },
      });

      render(<CompactCard article={articleWithContent} />);

      // 2500字 / 500 = 5分
      expect(screen.getByText(/5分/)).toBeInTheDocument();
      expect(screen.getByText(/2,500字/)).toBeInTheDocument();
    });

    it('元記事リンクボタンを表示する', () => {
      render(<CompactCard article={mockArticle} />);

      // 「元記事」テキストを含むボタン（ArticleCardと同じ表現）
      const externalLinkButton = screen.getByRole('button', {
        name: /元記事/i,
      });
      expect(externalLinkButton).toBeInTheDocument();
      expect(externalLinkButton).toHaveTextContent('元記事');
    });
  });

  describe('バッジ表示', () => {
    it('24時間以内の記事にNEWバッジを表示する', () => {
      const newArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          publishedAt: new Date(), // 現在時刻
        },
      });

      render(<CompactCard article={newArticle} />);

      expect(screen.getByLabelText('24時間以内の新着記事')).toBeInTheDocument();
    });

    it('24時間以上前の記事にはNEWバッジを表示しない', () => {
      render(<CompactCard article={mockArticle} />);

      expect(
        screen.queryByLabelText('24時間以内の新着記事')
      ).not.toBeInTheDocument();
    });

    it('未読記事に未読バッジを表示する', () => {
      render(<CompactCard article={mockArticle} isRead={false} />);

      expect(screen.getByTestId('unread-badge')).toBeInTheDocument();
      expect(screen.getByText('未読')).toBeInTheDocument();
    });

    it('既読記事には未読バッジを表示しない', () => {
      render(<CompactCard article={mockArticle} isRead={true} />);

      expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
    });
  });

  describe('既読状態のスタイル', () => {
    it('既読記事ではタイトルの透明度が変わる', () => {
      render(<CompactCard article={mockArticle} isRead={true} />);

      const title = screen.getByTestId('article-title');
      expect(title).toHaveClass('opacity-70');
    });

    it('未読記事ではタイトルの透明度は変わらない', () => {
      render(<CompactCard article={mockArticle} isRead={false} />);

      const title = screen.getByTestId('article-title');
      expect(title).not.toHaveClass('opacity-70');
    });
  });

  describe('インタラクション', () => {
    // card-with-link: div+onClick ではなくタイトルが実リンク。遷移はブラウザが担う
    it('タイトルが記事詳細への実リンクになっている', () => {
      render(<CompactCard article={mockArticle} />);

      const link = screen.getByTestId('article-title-link');
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toContain('/articles/1');
    });

    it('onArticleClickコールバックが提供されている場合実行する', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <CompactCard article={mockArticle} onArticleClick={handleClick} />
      );

      await user.click(screen.getByTestId('article-title-link'));

      expect(handleClick).toHaveBeenCalledWith(mockArticle.id);
    });

    it('タイトルリンクがキーボードでフォーカスできる', () => {
      render(<CompactCard article={mockArticle} />);

      const link = screen.getByTestId('article-title-link');
      link.focus();

      expect(link).toHaveFocus();
      // ネイティブ <a href> なので Enter での遷移はブラウザが担保する
      expect(link).toHaveAttribute('href');
    });

    it('タグクリック時にタグフィルターページに遷移する', async () => {
      const user = userEvent.setup();

      render(<CompactCard article={mockArticle} />);

      const reactTag = screen.getByText('React');
      await user.click(reactTag);

      expect(mockRouter.push).toHaveBeenCalledWith('/?tags=React&tagMode=OR');
    });

    it('お気に入りボタンクリック時にonToggleFavoriteを実行する', async () => {
      const handleToggleFavorite = jest.fn();
      const user = userEvent.setup();

      render(
        <CompactCard
          article={mockArticle}
          onToggleFavorite={handleToggleFavorite}
        />
      );

      const favoriteButton = screen.getByTestId('favorite-button');
      await user.click(favoriteButton);

      expect(handleToggleFavorite).toHaveBeenCalled();
    });

    it('お気に入りボタンクリック時はカードのクリックイベントを発火しない', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();

      render(
        <CompactCard article={mockArticle} onArticleClick={handleClick} />
      );

      const favoriteButton = screen.getByTestId('favorite-button');
      await user.click(favoriteButton);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('元記事リンクボタンクリック時に新しいタブで開く', async () => {
      const user = userEvent.setup();
      const mockOpen = jest.fn();
      window.open = mockOpen;

      render(<CompactCard article={mockArticle} />);

      const externalLinkButton = screen.getByRole('button', {
        name: /元記事/i,
      });
      await user.click(externalLinkButton);

      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('元記事リンクボタンクリック時はカードのクリックイベントを発火しない', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      window.open = jest.fn();

      render(
        <CompactCard article={mockArticle} onArticleClick={handleClick} />
      );

      const externalLinkButton = screen.getByRole('button', {
        name: /元記事/i,
      });
      await user.click(externalLinkButton);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('URLパラメータの保持', () => {
    it('現在のフィルター状態を記事詳細URLに含める', async () => {
      const searchParams = new URLSearchParams('tags=React&sortBy=publishedAt');
      (useSearchParams as jest.Mock).mockReturnValue(searchParams);

      render(<CompactCard article={mockArticle} />);

      const href = screen
        .getByTestId('article-title-link')
        .getAttribute('href') as string;

      expect(href).toContain('from=');
      const from = decodeURIComponent(
        new URL(`http://localhost${href}`).searchParams.get('from') as string
      );
      expect(from).toContain('tags=React');
      expect(from).toContain('returning=1');
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なdata-testidを持つ', () => {
      render(<CompactCard article={mockArticle} />);

      expect(screen.getByTestId('compact-card')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-button')).toBeInTheDocument();
    });

    // href を持たない role/tabIndex ではなく、タイトルを実リンクにして
    // スクリーンリーダーにリンク先を伝える（card-with-link）
    it('タイトルがリンクとして公開されている', () => {
      render(<CompactCard article={mockArticle} />);

      expect(
        screen.getByRole('link', { name: mockArticle.title })
      ).toBeInTheDocument();
    });

    it('タイトルリンクがフォーカス可能である', () => {
      render(<CompactCard article={mockArticle} />);

      const link = screen.getByTestId('article-title-link');
      link.focus();
      expect(link).toHaveFocus();
    });

    it('タグがキーボードで操作可能である', () => {
      render(<CompactCard article={mockArticle} />);

      const reactTag = screen.getByText('React');
      expect(reactTag).toHaveAttribute('tabIndex', '0');
      expect(reactTag).toHaveAttribute('role', 'button');
    });
  });

  describe('タグがない場合の表示', () => {
    it('タグ配列が空の場合タグセクションを表示しない', () => {
      const articleWithoutTags = createMockArticleWithRelations({
        article: mockArticle,
        tags: [],
      });

      render(<CompactCard article={articleWithoutTags} />);

      expect(screen.queryByText('React')).not.toBeInTheDocument();
      expect(screen.queryByText('+2')).not.toBeInTheDocument();
    });

    it('タグが1つの場合、カウントを表示しない', () => {
      const articleWithOneTag = createMockArticleWithRelations({
        article: mockArticle,
        tags: [{ name: 'React', id: 'tag-1' }],
      });

      render(<CompactCard article={articleWithOneTag} />);

      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
    });
  });

  describe('ソース非表示オプション', () => {
    it('showSource=falseの場合ソースを表示しない', () => {
      render(<CompactCard article={mockArticle} showSource={false} />);

      expect(screen.queryByText('Test Source')).not.toBeInTheDocument();
    });
  });

  describe('タグ非表示オプション', () => {
    it('showTags=falseの場合タグを表示しない', () => {
      render(<CompactCard article={mockArticle} showTags={false} />);

      expect(screen.queryByText('React')).not.toBeInTheDocument();
    });
  });

  describe('最小高さの保証（CLS対策）', () => {
    it('カードが最小高さ140pxを持つ', () => {
      render(<CompactCard article={mockArticle} />);

      const card = screen.getByTestId('compact-card');
      expect(card).toHaveClass('min-h-[140px]');
    });
  });
});
