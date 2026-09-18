import { render, screen, act, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
} from '@tanstack/react-query';
import { ArticleCount } from '@/app/components/common/article-count';

/**
 * ArticleCount の「非破壊ローディング」を固定する回帰テスト。
 *
 * 背景（ブランチ fix/forced-refetch-on-tab-return）:
 * - 以前の条件は `isFetchingCount || count === undefined || isLoadingPreferences` で、
 *   タブ復帰による再取得やセッション判定が走るだけで、表示済みの件数が
 *   スケルトンに差し替わっていた（home 一覧と同型の破壊的ガード）。
 * - 現在は `count === undefined` だけを見る。
 * - 逆に「データが無い間はスケルトン」を落とすと 0 件表示のちらつきになるため、
 *   その側も同時に固定する。
 */

type MockPreferences = {
  selectedCategories: string[];
  filterEnabled: boolean;
  periodMonths: number;
  isLoading: boolean;
};

const mockUsePersonalizationPreferences = jest.fn<MockPreferences, []>();
jest.mock('@/lib/hooks/use-personalization-preferences', () => ({
  usePersonalizationPreferences: () => mockUsePersonalizationPreferences(),
}));

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => mockSearchParams,
}));

function preferences(isLoading: boolean): MockPreferences {
  return {
    selectedCategories: [],
    filterEnabled: false,
    periodMonths: 12,
    isLoading,
  };
}

function countResponse(total: number) {
  return { ok: true, status: 200, json: async () => ({ data: { total } }) };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

// react-query v5 の notifyManager は setTimeout(0) で通知をまとめるため、
// refetch 直後の同期タイミングではコンポーネントはまだ再レンダリングされていない。
// 「再取得中の状態でコンポーネントが確かに再レンダリングされた」ことを
// 外から待てるようにするための監視用コンポーネント。
function FetchingProbe() {
  const fetching = useIsFetching({ queryKey: ['article-count'] });
  return <div data-testid="fetching-probe">{fetching}</div>;
}

function renderCount(queryClient: QueryClient) {
  // rerender に同一の element 参照を渡すと React が再レンダリングを省略するため、
  // 毎回新しい element を生成する。
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <ArticleCount />
      <FetchingProbe />
    </QueryClientProvider>
  );
  const utils = render(tree());
  return { ...utils, rerenderCount: () => utils.rerender(tree()) };
}

let mockFetch: jest.Mock;

describe('ArticleCount の非破壊ローディング', () => {
  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockUsePersonalizationPreferences.mockReturnValue(preferences(false));
    mockSearchParams = new URLSearchParams();
  });

  it('件数が表示済みなら、再取得中でもスケルトンに差し替えない', async () => {
    // タブ復帰による再取得のたびに件数が消えてスケルトンが出る症状のガード。
    // 再取得が実際に in-flight であることを確認してから表示を検証する。
    const queryClient = createClient();
    mockFetch.mockResolvedValueOnce(countResponse(1234));

    const { container } = renderCount(queryClient);
    expect(await screen.findByText('1,234件の記事')).toBeInTheDocument();

    const deferred = createDeferred<unknown>();
    mockFetch.mockReturnValueOnce(deferred.promise);
    await act(async () => {
      void queryClient.refetchQueries({ queryKey: ['article-count'] });
    });

    // 再取得が走り、まだ解決していないこと（＝旧実装がスケルトンにしていた状態）
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(queryClient.isFetching({ queryKey: ['article-count'] })).toBe(1);
    // 「再取得中」がコンポーネントツリーに反映されるまで待つ。
    // これを待たずに検証すると、単に再レンダリング前を見ているだけの偽陽性になる。
    await waitFor(() => {
      expect(screen.getByTestId('fetching-probe')).toHaveTextContent('1');
    });

    expect(screen.getByText('1,234件の記事')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeNull();

    await act(async () => {
      deferred.resolve(countResponse(1234));
      await deferred.promise;
    });
  });

  it('件数が表示済みなら、セッション判定中（isLoadingPreferences）でもスケルトンに差し替えない', async () => {
    // usePersonalizationPreferences の isLoading はタブ復帰で false → true に振れる。
    // そのたびに件数表示を捨てないことのガード。
    const queryClient = createClient();
    mockFetch.mockResolvedValueOnce(countResponse(4321));

    const { container, rerenderCount } = renderCount(queryClient);
    expect(await screen.findByText('4,321件の記事')).toBeInTheDocument();

    mockUsePersonalizationPreferences.mockReturnValue(preferences(true));
    rerenderCount();

    expect(screen.getByText('4,321件の記事')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('件数を未取得の間はスケルトンを出す', async () => {
    // 上の 2 本のために `count === undefined` の判定まで落とすと、
    // 初回ロードで「0件の記事」相当の空表示がちらつく。その側のガード。
    const queryClient = createClient();
    const deferred = createDeferred<unknown>();
    mockFetch.mockReturnValueOnce(deferred.promise);

    const { container } = renderCount(queryClient);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByText(/件の記事$/)).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve(countResponse(7));
      await deferred.promise;
    });
    expect(await screen.findByText('7件の記事')).toBeInTheDocument();
  });
});

/**
 * `returning` は記事詳細から戻ったことを示すだけの一時パラメータで、件数の
 * 絞り込み条件ではない。queryKey に混ぜると記事詳細から戻るたびに別 queryKey に
 * なり /api/articles が再取得される（use-infinite-articles.ts の
 * normalizedFilters では除外済みだが、この件数クエリで横展開が漏れていた）。
 */
describe('ArticleCount の returning 除外', () => {
  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockUsePersonalizationPreferences.mockReturnValue(preferences(false));
    mockSearchParams = new URLSearchParams();
  });

  it('returning が付いても queryKey が変わらず再取得が起きない', async () => {
    const queryClient = createClient();
    mockSearchParams = new URLSearchParams('sources=src-1');
    mockFetch.mockResolvedValue(countResponse(1234));

    const { rerenderCount } = renderCount(queryClient);
    expect(await screen.findByText('1,234件の記事')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const keysBefore = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['article-count'] })
      .map((query) => JSON.stringify(query.queryKey));
    expect(keysBefore).toHaveLength(1);

    // 記事詳細から戻ってきた状態
    mockSearchParams = new URLSearchParams('sources=src-1&returning=1');
    rerenderCount();

    await waitFor(() => {
      expect(screen.getByText('1,234件の記事')).toBeInTheDocument();
    });

    // queryKey が増えていない＝同一クエリのまま
    const keysAfter = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['article-count'] })
      .map((query) => JSON.stringify(query.queryKey));
    expect(keysAfter).toEqual(keysBefore);
    // 再取得も起きていない
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returning を API のリクエストパラメータに含めない', async () => {
    const queryClient = createClient();
    mockSearchParams = new URLSearchParams('sources=src-1&returning=1');
    mockFetch.mockResolvedValue(countResponse(42));

    renderCount(queryClient);
    expect(await screen.findByText('42件の記事')).toBeInTheDocument();

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    const requestedParams = new URLSearchParams(requestedUrl.split('?')[1]);
    expect(requestedParams.has('returning')).toBe(false);
    // 他の絞り込み条件は落としていないこと
    expect(requestedParams.get('sources')).toBe('src-1');
  });
});
