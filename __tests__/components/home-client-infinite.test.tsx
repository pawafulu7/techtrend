import { render, screen } from '@testing-library/react';
import { HomeClientInfinite } from '@/app/components/home/home-client-infinite';
import type { Source, Tag } from '@/lib/prisma-exports';

/**
 * ホーム一覧の「非破壊ローディング」を固定する回帰テスト。
 *
 * 背景（ブランチ fix/forced-refetch-on-tab-return）:
 * - 以前の条件は `(isLoading || isLoadingPreferences) && !isCategoryChanging` で、
 *   タブ復帰でセッション判定が走るだけで一覧 DOM が丸ごとスピナーに差し替わり、
 *   スクロール位置と表示内容が失われていた。
 * - 現在は `isPending`（= data === undefined と厳密に等価）だけを見る。
 * - ただし「データが無いときはスピナー」を落とすと Issue #569（空状態のフラッシュ）が
 *   再発するため、その側も同時に固定する。
 */

type MockArticle = { id: string; title: string };
type MockPage = { data: { items: MockArticle[]; total: number } };
type MockInfiniteArticles = {
  data?: { pages: MockPage[]; pageParams: number[] };
  fetchNextPage: jest.Mock;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isPending: boolean;
  // 旧実装が参照していたフィールド。false 固定にしておくことで、
  // 「isLoadingPreferences を見ていないこと」だけをテストの対象にできる。
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};
type MockPreferences = {
  selectedCategories: string[];
  filterEnabled: boolean;
  periodMonths: number;
  hasPreferences: boolean;
  isLoadingPreferences: boolean;
};

const mockUseInfiniteArticles = jest.fn<MockInfiniteArticles, []>();
jest.mock('@/app/hooks/use-infinite-articles', () => ({
  useInfiniteArticles: () => mockUseInfiniteArticles(),
}));

const mockUsePersonalizationPreferences = jest.fn<MockPreferences, []>();
jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  usePersonalizationPreferences: () => mockUsePersonalizationPreferences(),
}));

jest.mock('@/app/hooks/use-scroll-restoration', () => ({
  useScrollRestoration: () => ({
    saveScrollPosition: jest.fn(),
    isRestoring: false,
    currentPage: 0,
    targetPages: 0,
    cancelRestoration: jest.fn(),
  }),
}));

jest.mock('@/app/components/article/list', () => ({
  ArticleList: ({ articles }: { articles: MockArticle[] }) => (
    <div data-testid="article-list">{`${articles.length} articles`}</div>
  ),
}));

jest.mock('@/app/components/common/infinite-scroll-trigger', () => ({
  InfiniteScrollTrigger: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const ARTICLES: MockArticle[] = [
  { id: 'article-1', title: '記事1' },
  { id: 'article-2', title: '記事2' },
];

function loadedArticles(): MockInfiniteArticles {
  return {
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
  };
}

function noArticlesYet(): MockInfiniteArticles {
  return {
    data: undefined,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: true,
    isLoading: true,
    isError: false,
    refetch: jest.fn(),
  };
}

function preferences(isLoadingPreferences: boolean): MockPreferences {
  return {
    selectedCategories: [],
    filterEnabled: false,
    periodMonths: 12,
    hasPreferences: false,
    isLoadingPreferences,
  };
}

const SOURCES: Source[] = [];
const TAGS: Array<Tag & { count: number }> = [];

function renderHome() {
  return render(
    <HomeClientInfinite viewMode="card" sources={SOURCES} tags={TAGS} />
  );
}

describe('HomeClientInfinite の非破壊ローディング', () => {
  beforeEach(() => {
    mockUseInfiniteArticles.mockReturnValue(loadedArticles());
    mockUsePersonalizationPreferences.mockReturnValue(preferences(false));
  });

  it('記事が表示済みなら、セッション判定中（isLoadingPreferences）になっても一覧を保持する', () => {
    // タブ復帰で isLoadingPreferences が false → true に振れるだけで
    // 一覧 DOM を破棄し、スクロール位置と表示内容を失っていた症状のガード。
    const { rerender } = renderHome();
    expect(screen.getByTestId('article-list')).toBeInTheDocument();

    mockUsePersonalizationPreferences.mockReturnValue(preferences(true));
    rerender(
      <HomeClientInfinite viewMode="card" sources={SOURCES} tags={TAGS} />
    );

    expect(screen.getByTestId('article-list')).toHaveTextContent('2 articles');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(
      screen.queryByText('記事を読み込んでいます...')
    ).not.toBeInTheDocument();
  });

  it('記事 0 件で読み込み中のときはスピナーを出し、空状態を出さない', () => {
    // Issue #569「空状態のフラッシュ」のガード。
    // 上のテストのために isPending 判定を緩めると、読み込み中に
    // 「記事が見つかりませんでした」が一瞬出る症状が再発する。
    mockUseInfiniteArticles.mockReturnValue(noArticlesYet());
    mockUsePersonalizationPreferences.mockReturnValue(preferences(true));

    renderHome();

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('記事を読み込んでいます...')).toBeInTheDocument();
    expect(
      screen.queryByText('記事が見つかりませんでした')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-list')).not.toBeInTheDocument();
  });
});
