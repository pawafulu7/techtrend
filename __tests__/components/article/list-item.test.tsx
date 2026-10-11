import { act, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import '@testing-library/jest-dom';
import { ArticleListItem } from '@/app/components/article/list-item';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createMockArticleWithRelations,
  createMockSource,
} from '@/test/utils/mock-factories';
import { findPaletteColorClasses } from '@/test/utils/palette-classes';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(),
}));

jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: ({ articleId }: { articleId: string }) => (
    <button data-testid="favorite-button" aria-label="お気に入りに追加">
      Favorite {articleId}
    </button>
  ),
}));

describe('ArticleListItem', () => {
  const article = createMockArticleWithRelations({
    article: {
      id: 'list-1',
      title: 'List Item Title',
      summary: 'List item summary',
      publishedAt: new Date('2025-01-01T10:00:00Z'),
      createdAt: new Date('2025-01-01T11:00:00Z'),
    },
    source: createMockSource({ name: 'Qiita' }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  });

  it('shows title, summary and meta (source, published and fetched dates) in that order', () => {
    render(<ArticleListItem article={article} />);

    const title = screen.getByTestId('article-title');
    const summary = screen.getByTestId('article-summary');
    const source = screen.getByTestId('article-source');

    expect(title).toHaveTextContent('List Item Title');
    expect(source).toHaveTextContent('Qiita');
    expect(screen.getByText('公開日:')).toBeInTheDocument();
    expect(screen.getByText('収集日:')).toBeInTheDocument();
    // タイトル → 要約 → メタ情報の順に並ぶ
    expect(
      title.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      summary.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('uses icons instead of emoji for the dates', () => {
    const { container } = render(<ArticleListItem article={article} />);

    expect(container.textContent).not.toMatch(/📅|📥/);
  });

  it('does not color the row by source (only brand/state tokens)', () => {
    const { container } = render(
      <ArticleListItem
        article={{ ...article, publishedAt: new Date() }}
        isRead={false}
      />
    );

    expect(findPaletteColorClasses(container)).toEqual([]);
  });

  it('marks unread and new articles without badges', () => {
    render(
      <ArticleListItem
        article={{ ...article, publishedAt: new Date() }}
        isRead={false}
      />
    );

    expect(screen.getByRole('img', { name: '未読' })).toBeInTheDocument();
    expect(screen.getByTestId('new-label')).toHaveTextContent('新着');
  });

  it('does not mark read, old articles', () => {
    render(<ArticleListItem article={article} isRead />);

    expect(screen.queryByRole('img', { name: '未読' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-label')).not.toBeInTheDocument();
  });

  it('keeps the actions in the layout so touch devices can see them', () => {
    render(<ArticleListItem article={article} />);

    const actions = screen.getByTestId('article-actions');
    expect(within(actions).getByTestId('favorite-button')).toBeInTheDocument();
    expect(within(actions).getByLabelText('元記事を開く')).toBeInTheDocument();
    // display:none で隠すとタッチ端末で出せない。隠すのは hover できる端末だけ（透明度）で、
    // 隠しているあいだは押せないようにする
    expect(actions).not.toHaveClass('hidden');
    expect(actions).toHaveClass(
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:pointer-events-none'
    );
  });

  it('shows the company name for company blog articles, like the other card views', () => {
    render(
      <ArticleListItem article={{ ...article, companyName: 'Example Inc.' }} />
    );

    expect(screen.getByTestId('article-source')).toHaveTextContent(
      'Example Inc.'
    );
  });

  it('サーバー描画と hydration で経過時間の文字列が食い違わない（issue #714）', async () => {
    // 30分前の記事。描画中に現在時刻から作ると、分の差で文字列が変わる
    const recent = createMockArticleWithRelations({
      article: {
        id: 'list-recent',
        publishedAt: new Date(Date.now() - 30 * 60 * 1000),
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
      source: createMockSource({ name: 'Qiita' }),
    });
    const html = renderToString(<ArticleListItem article={recent} />);

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    // サーバー描画から 2 分後に hydrate する（Date だけを進め、タイマーは本物のまま）
    jest.useFakeTimers({
      now: Date.now() + 2 * 60 * 1000,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      let root: ReturnType<typeof hydrateRoot> | undefined;
      await act(async () => {
        root = hydrateRoot(container, <ArticleListItem article={recent} />, {
          onRecoverableError: (error) => console.error(error),
        });
      });
      const hydrationErrors = consoleError.mock.calls.filter((args) =>
        String(args[0]).toLowerCase().includes('hydrat')
      );
      expect(hydrationErrors).toEqual([]);
      // hydration の後に経過時間へ切り替わる
      expect(container.textContent).toContain('0h');
      act(() => root?.unmount());
    } finally {
      jest.useRealTimers();
      consoleError.mockRestore();
      container.remove();
    }
  });
});
