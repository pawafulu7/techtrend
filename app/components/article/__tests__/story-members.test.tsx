import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticleList } from '@/app/components/article/list';
import { createMockArticleWithRelations } from '@/test/utils/mock-factories';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams('category=AI'),
}));

jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: jest.fn().mockReturnValue({ data: null, isPending: false }),
  },
}));

jest.mock('@/app/components/article/card', () => ({
  ArticleCard: ({ article }: { article: { id: string; title: string } }) => (
    <div data-testid={`article-card-${article.id}`}>{article.title}</div>
  ),
}));

jest.mock('@/app/components/article/favorite-button', () => ({
  FavoriteButton: ({
    articleId,
    isFavorited,
  }: {
    articleId: string;
    isFavorited?: boolean;
  }) => (
    <button
      type="button"
      data-testid={`favorite-${articleId}`}
      data-favorited={String(Boolean(isFavorited))}
    />
  ),
}));

const article = (
  id: string,
  title: string,
  storyId: string | null,
  storySize: number | null
) =>
  createMockArticleWithRelations({
    article: { id, title, summary: 's', storyId, storySize },
  });

describe('ArticleList の同じストーリーのまとめ（issue #723）', () => {
  let queryClient: QueryClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const renderList = (groupStories: boolean) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ArticleList
          viewMode="card"
          groupStories={groupStories}
          articles={[
            article('m1', 'Sonnet 5.5 launches', 'rep', 3),
            article('solo', '単独の記事', null, null),
            article('rep', 'Sonnet 5.5を発表', 'rep', 3),
          ]}
        />
      </QueryClientProvider>
    );

  it('同じストーリーの記事を代表の1枚にまとめ、「ほか N 件」を付ける', () => {
    renderList(true);

    expect(screen.getByTestId('article-card-rep')).toBeInTheDocument();
    expect(screen.queryByTestId('article-card-m1')).not.toBeInTheDocument();
    expect(screen.getByTestId('article-card-solo')).toBeInTheDocument();
    const toggle = screen.getByTestId('story-members-toggle');
    expect(toggle).toHaveTextContent('ほか 2 件');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // 開くまでは取得しない
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('groupStories を付けない一覧（ホーム以外）はまとめない', () => {
    renderList(false);

    expect(screen.getByTestId('article-card-m1')).toBeInTheDocument();
    expect(screen.getByTestId('article-card-rep')).toBeInTheDocument();
    expect(screen.queryByTestId('story-members')).not.toBeInTheDocument();
  });

  it('開くと、代表以外の記事をお気に入り・既読の状態と元の一覧への戻り先つきで並べる', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          storyId: 'rep',
          items: [
            {
              id: 'm1',
              title: 'Sonnet 5.5 launches',
              translatedTitle: 'Sonnet 5.5 登場',
              publishedAt: '2026-09-28T09:00:00.000Z',
              source: { id: 's1', name: 'The New Stack' },
              isFavorited: true,
              isRead: false,
            },
            {
              id: 'rep',
              title: 'Sonnet 5.5を発表',
              translatedTitle: null,
              publishedAt: '2026-09-28T13:00:00.000Z',
              source: { id: 's2', name: 'ITmedia AI+' },
              isFavorited: false,
              isRead: false,
            },
            {
              id: 'm2',
              title: 'Sonnet 5.5の使い方',
              translatedTitle: null,
              publishedAt: '2026-09-29T10:00:00.000Z',
              source: { id: 's3', name: 'gihyo.jp' },
              isFavorited: false,
              isRead: true,
            },
          ],
        },
      }),
    });
    renderList(true);

    await userEvent.click(screen.getByTestId('story-members-toggle'));

    expect(fetchMock).toHaveBeenCalledWith('/api/stories/rep');
    const rows = await screen.findAllByTestId('story-member');
    expect(rows.map((r) => r.getAttribute('data-story-member-id'))).toEqual([
      'm1',
      'm2',
    ]);
    const first = within(rows[0]);
    expect(
      first.getByRole('link', { name: 'Sonnet 5.5 登場' })
    ).toHaveAttribute(
      'href',
      `/articles/m1?from=${encodeURIComponent('/?category=AI&returning=1')}`
    );
    expect(first.getByText('The New Stack')).toBeInTheDocument();
    expect(first.getByRole('img', { name: '未読' })).toBeInTheDocument();
    expect(screen.getByTestId('favorite-m1')).toHaveAttribute(
      'data-favorited',
      'true'
    );
    expect(within(rows[1]).queryByRole('img', { name: '未読' })).toBeNull();
    expect(screen.getByTestId('story-members-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('取得に失敗したら理由を出し、再試行できる', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { storyId: 'rep', items: [] },
      }),
    });
    renderList(true);

    await userEvent.click(screen.getByTestId('story-members-toggle'));
    expect(
      await screen.findByText('同じ話題の記事を読み込めませんでした')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '再試行' }));
    await waitFor(() =>
      expect(
        screen.getByText('ほかの記事は見つかりませんでした')
      ).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
