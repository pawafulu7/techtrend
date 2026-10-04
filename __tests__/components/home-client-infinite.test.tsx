import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
type MockPage = {
  data: { items: MockArticle[]; total: number };
  fetchedAt?: number;
};
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
  isRefetchError?: boolean;
  refetch: jest.Mock;
};
type MockPreferences = {
  selectedCategories: string[];
  filterEnabled: boolean;
  periodMonths: number;
  hasPreferences: boolean;
  isLoadingPreferences: boolean;
};

type InfiniteArticlesOptions = { enabled?: boolean } | undefined;

const mockUseInfiniteArticles = jest.fn<
  MockInfiniteArticles,
  [Record<string, unknown>, InfiniteArticlesOptions]
>();
// 第 2 引数（options）まで通す。ここで引数を捨てると、コンポーネントが渡している
// `{ enabled: !isLoadingPreferences }` が一切検証されなくなる。
jest.mock('@/app/hooks/use-infinite-articles', () => ({
  useInfiniteArticles: (
    filters: Record<string, unknown>,
    options: InfiniteArticlesOptions
  ) => mockUseInfiniteArticles(filters, options),
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
    <div data-testid="article-list">
      {`${articles.length} articles`}
      {articles.map((a) => (
        <div key={a.id} data-article-id={a.id} />
      ))}
    </div>
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

/** useInfiniteArticles に最後に渡された options（第 2 引数） */
function lastInfiniteArticlesOptions(): InfiniteArticlesOptions {
  const calls = mockUseInfiniteArticles.mock.calls;
  return calls[calls.length - 1]?.[1];
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

/**
 * 記事クエリの enabled は `!isLoadingPreferences` で決まる。この配線が外れる
 * （第 2 引数を渡し忘れる・条件を変える）と、enabled の true→false→true 再遷移で
 * TanStack Query の shouldFetchOptionally 経路が走り、読み込み済み全ページの
 * 再取得が復活する。
 *
 * なお「isLoadingPreferences が一度 false になったら true へ戻らない」ラッチ側の
 * 保証は __tests__/hooks/use-personalization-preferences.test.tsx が固定している
 * （このファイルでは usePersonalizationPreferences をモックしているため、
 *   ここで検証できるのは配線だけ）。2 つ合わせて「enabled が振れない」が担保される。
 */
describe('HomeClientInfinite の記事クエリ enabled 配線', () => {
  beforeEach(() => {
    mockUseInfiniteArticles.mockReturnValue(loadedArticles());
  });

  it('isLoadingPreferences をそのまま反転して enabled に渡している', () => {
    mockUsePersonalizationPreferences.mockReturnValue(preferences(false));
    const { rerender } = renderHome();

    expect(lastInfiniteArticlesOptions()).toEqual({ enabled: true });

    mockUsePersonalizationPreferences.mockReturnValue(preferences(true));
    rerender(
      <HomeClientInfinite viewMode="card" sources={SOURCES} tags={TAGS} />
    );

    expect(lastInfiniteArticlesOptions()).toEqual({ enabled: false });
  });
});

/**
 * 手動更新（issue #707）。自動の再取得は無効なので、新着はこのボタンで取り込む。
 * 読み込み済みの全ページを取り直し、読んでいた記事を画面上の同じ位置に保つ。
 */
describe('HomeClientInfinite の手動更新', () => {
  // 2026-10-04 13:58 UTC = 22:58 JST
  const FETCHED_AT = Date.UTC(2026, 9, 4, 13, 58);
  function pageWith(items: MockArticle[], fetchedAt: number) {
    const data = {
      pages: [{ data: { items, total: items.length }, fetchedAt }],
      pageParams: [1],
    };
    return {
      ...loadedArticles(),
      data,
      // 本物の refetch と同じく結果を返す（新しい一覧は来ない）
      refetch: jest.fn().mockResolvedValue({ isError: false, data }),
    };
  }

  beforeEach(() => {
    mockUsePersonalizationPreferences.mockReturnValue(preferences(false));
  });

  it('一覧を取得した時刻と更新ボタンを出し、押すと取り直す', async () => {
    const state = pageWith(ARTICLES, FETCHED_AT);
    mockUseInfiniteArticles.mockReturnValue(state);
    renderHome();

    const freshness = screen.getByTestId('data-freshness');
    expect(freshness).toHaveTextContent('10月4日 22:58 に取得');
    expect(freshness.querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-10-04T13:58:00.000Z'
    );

    fireEvent.click(screen.getByRole('button', { name: '最新に更新' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '最新に更新' })
      ).not.toBeDisabled()
    );
  });

  // 位置を保つ処理そのものは __tests__/hooks/use-refresh-keeping-position.test.tsx が
  // 本物の TanStack Query で確かめる
  it('次ページの読み込み中は更新を押せない（取り直しが読み込みを取り消すため）', () => {
    mockUseInfiniteArticles.mockReturnValue({
      ...pageWith(ARTICLES, FETCHED_AT),
      isFetchingNextPage: true,
    });
    renderHome();

    expect(screen.getByRole('button', { name: '最新に更新' })).toBeDisabled();
  });

  it('取り直しに失敗しても一覧を残し、失敗を知らせる', () => {
    mockUseInfiniteArticles.mockReturnValue({
      ...pageWith(ARTICLES, FETCHED_AT),
      isError: true,
      isRefetchError: true,
    });
    renderHome();

    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '最新の一覧を取得できませんでした。'
    );
    expect(screen.queryByText('エラーが発生しました')).not.toBeInTheDocument();
  });

  it('初回の取得の失敗は従来どおりエラー画面を出す', () => {
    mockUseInfiniteArticles.mockReturnValue({
      ...noArticlesYet(),
      isPending: false,
      isError: true,
    });
    renderHome();

    expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
  });
});
