import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ArticleCard } from '@/app/components/article/card';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

// Next.jsのモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
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
jest.mock('@/components/article/favorite-button', () => ({
  FavoriteButton: ({ articleId }: { articleId: string }) => (
    <button data-testid="favorite-button">Favorite {articleId}</button>
  ),
}));

// ShareButtonモック
jest.mock('@/app/components/article/share-button', () => ({
  ShareButton: ({ title }: { title: string }) => (
    <button data-testid="share-button">Share {title}</button>
  ),
}));

// ArticleThumbnailモック
jest.mock('@/app/components/common/optimized-image', () => ({
  ArticleThumbnail: ({ alt }: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="article-thumbnail" alt={alt} />
  ),
}));

describe('ArticleCard', () => {
  const mockRouter = {
    push: jest.fn(),
    prefetch: jest.fn(),
  };

  const mockSearchParams = new URLSearchParams();

  const mockArticle = createMockArticleWithRelations({
    article: {
      id: '1',
      title: 'Test Article Title',
      summary: 'This is a test article summary that should be displayed on the card.',
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
    (useSession as jest.Mock).mockReturnValue({ data: null, status: 'unauthenticated' });
    
    // windowのlocation.hrefをモック（jsdom互換の方法）
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        href: '/',
        origin: 'http://localhost',
        assign: jest.fn(),
        replace: jest.fn(),
        reload: jest.fn(),
      },
    });
    
    // fetchのモック
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('記事情報を正しく表示する', () => {
      render(<ArticleCard article={mockArticle} />);
      
      // タイトルが表示される
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
      
      // 要約が表示される
      expect(screen.getByText(/This is a test article summary/)).toBeInTheDocument();
      
      // ソース名が表示される
      expect(screen.getByText('Test Source')).toBeInTheDocument();
      
      // タグが表示される（最大2つ）
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Testing')).toBeInTheDocument();
      // 3つ目のタグは+1として表示される
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('新着記事バッジを24時間以内の記事に表示する', () => {
      const newArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          publishedAt: new Date(), // 現在時刻
        },
      });
      
      render(<ArticleCard article={newArticle} />);
      
      // Newバッジが表示される
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('未読バッジを未読記事に表示する', () => {
      render(<ArticleCard article={mockArticle} isRead={false} />);
      
      // 未読バッジが表示される
      expect(screen.getByText('未読')).toBeInTheDocument();
    });

    it('既読記事ではタイトルの透明度が変わる', () => {
      render(<ArticleCard article={mockArticle} isRead={true} />);
      
      const title = screen.getByText('Test Article Title');
      expect(title).toHaveClass('opacity-70');
    });
  });

  describe('サムネイル表示ロジック', () => {
    it('Speaker Deckの記事でサムネイルがある場合表示する', () => {
      const speakerDeckArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          thumbnail: 'https://example.com/thumbnail.jpg',
        },
        source: {
          name: 'Speaker Deck',
        },
      });
      
      render(<ArticleCard article={speakerDeckArticle} />);
      
      expect(screen.getByTestId('article-thumbnail')).toBeInTheDocument();
    });

    it('Docswellの記事でサムネイルがある場合表示する', () => {
      const docswellArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          thumbnail: 'https://example.com/thumbnail.jpg',
        },
        source: {
          name: 'Docswell',
        },
      });
      
      render(<ArticleCard article={docswellArticle} />);
      
      expect(screen.getByTestId('article-thumbnail')).toBeInTheDocument();
    });

    it('薄いコンテンツ（300文字未満）でサムネイルがある場合表示する', () => {
      const thinContentArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          content: 'Short content',
          thumbnail: 'https://example.com/thumbnail.jpg',
        },
      });
      
      render(<ArticleCard article={thinContentArticle} />);
      
      expect(screen.getByTestId('article-thumbnail')).toBeInTheDocument();
    });

    it('品質スコアが低い（30未満）でサムネイルがある場合表示する', () => {
      const lowQualityArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          qualityScore: 25,
          thumbnail: 'https://example.com/thumbnail.jpg',
        },
      });
      
      render(<ArticleCard article={lowQualityArticle} />);
      
      expect(screen.getByTestId('article-thumbnail')).toBeInTheDocument();
    });

    it('通常の記事ではサムネイルの代わりに要約を表示する', () => {
      const normalArticle = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          content: 'This is a very long content that exceeds 300 characters...' + 'x'.repeat(300),
          qualityScore: 80,
          thumbnail: 'https://example.com/thumbnail.jpg',
        },
      });
      
      render(<ArticleCard article={normalArticle} />);
      
      expect(screen.queryByTestId('article-thumbnail')).not.toBeInTheDocument();
      expect(screen.getByText(/This is a test article summary/)).toBeInTheDocument();
    });
  });

  describe('インタラクション', () => {
    it('onArticleClickコールバックが提供されている場合実行する', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} onArticleClick={handleClick} />);
      
      const card = screen.getByTestId('article-card');
      await user.click(card);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('カードクリック時に記事詳細ページにナビゲートする', async () => {
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} />);
      
      const card = screen.getByTestId('article-card');
      await user.click(card);
      
      // window.location.hrefが更新される
      expect(window.location.href).toContain('/articles/1');
    });

    it('ボタンクリック時はカードのクリックイベントを発火しない', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} onArticleClick={handleClick} />);
      
      const favoriteButton = screen.getByTestId('favorite-button');
      await user.click(favoriteButton);
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('外部リンクボタンをクリックすると新しいタブで開く', async () => {
      const user = userEvent.setup();
      const mockOpen = jest.fn();
      window.open = mockOpen;
      
      render(<ArticleCard article={mockArticle} />);
      
      const externalLinkButton = screen.getByTitle('元記事を開く');
      await user.click(externalLinkButton);
      
      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com/article',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('タグをクリックするとタグフィルターページに遷移する', async () => {
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} />);
      
      const reactTag = screen.getByText('React');
      await user.click(reactTag);
      
      expect(window.location.href).toContain('/?tags=React&tagMode=OR');
    });

    it('投票ボタンをクリックするとAPIを呼び出す', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ votes: 6 }),
      });
      
      render(<ArticleCard article={mockArticle} />);
      
      const voteButton = screen.getByRole('button', { name: /5/i });
      await user.click(voteButton);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/articles/1/vote', {
          method: 'POST',
        });
      });
      
      // 投票数が更新される
      expect(screen.getByText('6')).toBeInTheDocument();
    });

    it('投票済みの場合は再投票できない', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ votes: 6 }),
      });
      
      render(<ArticleCard article={mockArticle} />);
      
      const voteButton = screen.getByRole('button', { name: /5/i });
      
      // 1回目の投票
      await user.click(voteButton);
      
      await waitFor(() => {
        expect(voteButton).toBeDisabled();
      });
      
      // 2回目の投票試行
      await user.click(voteButton);
      
      // APIは1回しか呼ばれない
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('投票APIがエラーを返しても適切に処理する', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      render(<ArticleCard article={mockArticle} />);
      
      const voteButton = screen.getByRole('button', { name: /5/i });
      await user.click(voteButton);
      
      // エラーが発生しても投票数は変わらない
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
      
      // ボタンは無効化されない
      expect(voteButton).not.toBeDisabled();
    });
  });

  describe('URLパラメータの保持', () => {
    it('現在のフィルター状態を記事詳細URLに含める', async () => {
      const searchParams = new URLSearchParams('tags=React&sortBy=publishedAt');
      (useSearchParams as jest.Mock).mockReturnValue(searchParams);
      
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} />);
      
      const card = screen.getByTestId('article-card');
      await user.click(card);
      
      // URLにfromパラメータが含まれる
      expect(window.location.href).toContain('from=');
      expect(window.location.href).toContain('tags%3DReact');
      expect(window.location.href).toContain('sortBy%3DpublishedAt');
    });

    it('returningパラメータを除外して新しく追加する', async () => {
      const searchParams = new URLSearchParams('returning=1&tags=React');
      (useSearchParams as jest.Mock).mockReturnValue(searchParams);
      
      const user = userEvent.setup();
      
      render(<ArticleCard article={mockArticle} />);
      
      const card = screen.getByTestId('article-card');
      await user.click(card);
      
      // URLにreturning=1が1つだけ含まれる
      const url = window.location.href;
      const returningCount = (url.match(/returning%3D1/g) || []).length;
      expect(returningCount).toBe(1);
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なdata-testidを持つ', () => {
      render(<ArticleCard article={mockArticle} />);
      
      expect(screen.getByTestId('article-card')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-button')).toBeInTheDocument();
      expect(screen.getByTestId('share-button')).toBeInTheDocument();
    });

    it('クリック可能な要素にカーソルポインターを設定', () => {
      render(<ArticleCard article={mockArticle} />);
      
      const card = screen.getByTestId('article-card');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('ホバー時のスタイル変更', () => {
      render(<ArticleCard article={mockArticle} />);
      
      const card = screen.getByTestId('article-card');
      expect(card).toHaveClass('hover:shadow-lg');
      expect(card).toHaveClass('hover:-translate-y-0.5');
    });
  });

  describe('タグがない場合の表示', () => {
    it('タグ配列が空の場合タグセクションを表示しない', () => {
      const articleWithoutTags = createMockArticleWithRelations({
        article: mockArticle,
        tags: [],
      });
      
      render(<ArticleCard article={articleWithoutTags} />);
      
      // タグセクションが存在しない
      expect(screen.queryByText('React')).not.toBeInTheDocument();
      expect(screen.queryByText('Testing')).not.toBeInTheDocument();
      expect(screen.queryByText('+1')).not.toBeInTheDocument();
    });
  });

  describe('要約がない場合の表示', () => {
    it('要約がnullの場合でも正常にレンダリングする', () => {
      const articleWithoutSummary = createMockArticleWithRelations({
        article: {
          ...mockArticle,
          summary: null,
        },
      });
      
      render(<ArticleCard article={articleWithoutSummary} />);
      
      // タイトルは表示される
      expect(screen.getByText('Test Article Title')).toBeInTheDocument();
      // 要約セクションは表示されない
      expect(screen.queryByText(/This is a test article summary/)).not.toBeInTheDocument();
    });
  });
});