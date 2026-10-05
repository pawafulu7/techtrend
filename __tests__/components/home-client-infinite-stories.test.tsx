import { render } from '@testing-library/react';
import { HomeClientInfinite } from '@/app/components/home/home-client-infinite';
import type { Source, Tag } from '@/lib/prisma-exports';

/**
 * ホームの一覧で同じストーリーの記事をまとめたとき（issue #723）、手動更新（#707）の
 * 位置合わせに渡す記事の並びが、描画する並び（代表だけ）と一致することを固定する。
 * 一致しないと useRefreshKeepingPosition が描画の完了を判定できず、位置を合わせない。
 */

type MockArticle = {
  id: string;
  title: string;
  storyId: string | null;
  storySize: number | null;
  qualityScore: number;
  publishedAt: string;
};

const article = (
  id: string,
  title: string,
  storyId: string | null = null,
  storySize: number | null = null
): MockArticle => ({
  id,
  title,
  storyId,
  storySize,
  qualityScore: 50,
  publishedAt: '2026-09-28T00:00:00.000Z',
});

const ARTICLES = [
  article('m1', 'Sonnet 5.5 launches', 'rep', 2),
  article('solo', '単独の記事'),
  article('rep', 'Sonnet 5.5を発表', 'rep', 2),
];

jest.mock('@/app/hooks/use-infinite-articles', () => ({
  useInfiniteArticles: () => ({
    data: {
      pages: [{ data: { items: ARTICLES, total: ARTICLES.length } }],
      pageParams: [1],
    },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  usePersonalizationPreferences: () => ({
    selectedCategories: [],
    filterEnabled: false,
    periodMonths: 12,
    hasPreferences: false,
    isLoadingPreferences: false,
  }),
}));

jest.mock('@/app/hooks/use-scroll-restoration', () => ({
  useScrollRestoration: () => ({
    isRestoring: false,
    currentPage: 0,
    targetPages: 0,
    cancelRestoration: jest.fn(),
  }),
}));

const mockUseRefreshKeepingPosition = jest.fn();
jest.mock('@/app/hooks/use-refresh-keeping-position', () => ({
  useRefreshKeepingPosition: (options: unknown) => {
    mockUseRefreshKeepingPosition(options);
    return { isRefreshing: false, refresh: jest.fn() };
  },
}));

const mockArticleList = jest.fn();
jest.mock('@/app/components/article/list', () => ({
  ArticleList: (props: unknown) => {
    mockArticleList(props);
    return null;
  },
}));

jest.mock('@/app/components/common/infinite-scroll-trigger', () => ({
  InfiniteScrollTrigger: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const SOURCES: Source[] = [];
const TAGS: Array<Tag & { count: number }> = [];

describe('HomeClientInfinite のストーリーのまとめ', () => {
  it('一覧にまとめを頼み、手動更新の位置合わせには代表だけの並びを渡す', () => {
    render(
      <HomeClientInfinite viewMode="card" sources={SOURCES} tags={TAGS} />
    );

    expect(mockArticleList).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupStories: true })
    );
    expect(mockUseRefreshKeepingPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ articleIds: ['rep', 'solo'] })
    );
  });
});
