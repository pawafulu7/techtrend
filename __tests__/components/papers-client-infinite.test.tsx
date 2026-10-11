/**
 * 論文一覧: 取得の失敗は生の error.message ではなく利用者向けの文言と再試行で示す（issue #701）
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PapersClientInfinite } from '@/app/components/papers/papers-client-infinite';

const mockUseInfiniteArticles = jest.fn();
jest.mock('@/app/hooks/use-infinite-articles', () => ({
  useInfiniteArticles: () => mockUseInfiniteArticles(),
}));

jest.mock('@/app/hooks/use-scroll-restoration', () => ({
  useScrollRestoration: () => ({
    isRestoring: false,
    currentPage: 0,
    targetPages: 0,
    cancelRestoration: jest.fn(),
  }),
}));

jest.mock('@/app/components/article/list', () => ({
  ArticleList: () => <div data-testid="article-list" />,
}));

jest.mock('@/app/components/common/infinite-scroll-trigger', () => ({
  InfiniteScrollTrigger: () => <div data-testid="infinite-scroll-trigger" />,
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function state(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    isFetching: false,
    errorUpdateCount: 0,
    refetch: jest.fn(),
    ...overrides,
  };
}

function renderPapers() {
  render(<PapersClientInfinite viewMode="card" sourceId="arxiv" />);
}

describe('PapersClientInfinite: 取得の状態（issue #701）', () => {
  it('失敗したら生の文言を出さず、失敗と再試行を出す', () => {
    const current = state({
      isError: true,
      errorUpdateCount: 1,
      error: new Error('Internal server error'),
    });
    mockUseInfiniteArticles.mockReturnValue(current);
    renderPapers();

    expect(screen.getByRole('alert')).toHaveTextContent(
      '論文を読み込めませんでした'
    );
    expect(screen.queryByText(/Internal server error/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(current.refetch).toHaveBeenCalledTimes(1);
  });

  it('失敗後の再試行中も、スケルトンに戻さず失敗表示を残す', () => {
    mockUseInfiniteArticles.mockReturnValue(
      state({ isPending: true, isFetching: true, errorUpdateCount: 1 })
    );
    renderPapers();

    expect(screen.getByRole('button', { name: '再試行中…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('初回の読み込み中はスケルトン、0件なら空状態を出す', async () => {
    mockUseInfiniteArticles.mockReturnValue(state({ isPending: true }));
    const { unmount } = render(
      <PapersClientInfinite viewMode="card" sourceId="arxiv" />
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '論文を読み込んでいます...'
      );
    });
    unmount();

    mockUseInfiniteArticles.mockReturnValue(
      state({
        data: { pages: [{ data: { items: [], total: 0 } }], pageParams: [1] },
      })
    );
    renderPapers();
    expect(screen.getByText('条件に合う論文はありません')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  const pages = {
    pages: [{ data: { items: [{ id: 'p1' }], total: 40 } }],
    pageParams: [1],
  };

  it('続きのページの失敗は一覧を残して下端に出し、自動の取得を止める', () => {
    const current = state({
      data: pages,
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
    });
    mockUseInfiniteArticles.mockReturnValue(current);
    renderPapers();

    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '続きを読み込めませんでした'
    );
    expect(
      screen.queryByTestId('infinite-scroll-trigger')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(current.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('一覧がある状態で取り直しに失敗したら、内容を残して古いことを示す', () => {
    const current = state({ data: pages, isError: true });
    mockUseInfiniteArticles.mockReturnValue(current);
    renderPapers();

    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '最新の論文を読み込めませんでした'
    );
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(current.refetch).toHaveBeenCalledTimes(1);
  });
});
