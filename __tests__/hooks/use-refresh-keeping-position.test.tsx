import { useEffect, useMemo, useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { useRefreshKeepingPosition } from '@/app/hooks/use-refresh-keeping-position';

/**
 * ホーム一覧の手動更新で、読んでいた記事を画面上の同じ位置に保つ（issue #707）。
 *
 * 本物の TanStack Query を通す。refetch の Promise はデータが描画に届く前に解決し、
 * さらに ArticleList は受け取った記事を useEffect で内部 state に移してから描画する。
 * この2段の遅れをモックで省くと、位置を戻す処理が実際には動かないことを見逃す。
 */

const ROW_HEIGHT = 100;

// 記事は1件 100px で縦に並ぶものとし、DOM の順番とスクロール量から位置を決める
function mockLayout() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    let top = 0;
    let height = 800;
    if (this.dataset.articleId) {
      const container = document.getElementById('container')!;
      const index = Array.from(
        container.querySelectorAll('[data-article-id]')
      ).indexOf(this);
      top = index * ROW_HEIGHT - container.scrollTop;
      height = ROW_HEIGHT;
    }
    return {
      top,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 0,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

// ArticleList と同じく、受け取った記事を useEffect で内部 state に移してから描画する
function DelayedList({ ids }: { ids: string[] }) {
  const [shown, setShown] = useState(ids);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(ids);
  }, [ids]);
  return (
    <>
      {shown.map((id) => (
        <div key={id} data-article-id={id} />
      ))}
    </>
  );
}

const server = {
  ids: [] as string[],
  fail: false,
  clock: 0,
  // 設定すると、応答をこの Promise の解決まで止める
  gate: null as Promise<void> | null,
};

function Harness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ['refresh-keeping-position'],
    initialPageParam: 1,
    queryFn: async () => {
      if (server.gate) await server.gate;
      if (server.fail) throw new Error('fetch failed');
      server.clock += 1;
      return { ids: [...server.ids], fetchedAt: server.clock };
    },
    getNextPageParam: () => undefined,
  });
  const ids = useMemo(
    () => query.data?.pages.flatMap((page) => page.ids) ?? [],
    [query.data]
  );
  const { refresh, isRefreshing } = useRefreshKeepingPosition({
    containerRef,
    refetch: query.refetch,
    fetchedAt: query.data?.pages[0]?.fetchedAt,
    articleIds: ids,
    listKey: 'home',
  });
  return (
    <div ref={containerRef} id="container">
      <DelayedList ids={ids} />
      <button onClick={() => void refresh()}>更新</button>
      <span data-testid="state">
        {isRefreshing
          ? 'refreshing'
          : `idle:${query.data?.pages[0]?.fetchedAt}`}
      </span>
    </div>
  );
}

const OLD_IDS = Array.from({ length: 20 }, (_, i) => `a${i}`);

function renderHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
}

describe('useRefreshKeepingPosition（issue #707）', () => {
  let restoreLayout: () => void;

  beforeEach(() => {
    server.ids = OLD_IDS;
    server.fail = false;
    server.clock = 0;
    server.gate = null;
    restoreLayout = mockLayout();
  });

  afterEach(() => restoreLayout());

  it('新着が上に入っても、読んでいた記事を画面上の同じ位置に保つ', async () => {
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:1')
    );
    const container = document.getElementById('container')!;
    // a5 が上端から 50px はみ出した位置で読んでいる
    container.scrollTop = 550;

    server.ids = ['n1', 'n2', 'n3', ...OLD_IDS];
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:2')
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-article-id="n1"]')
      ).toBeInTheDocument()
    );
    // 3件（300px）押し下げられた分だけスクロールし、a5 は同じ位置に残る
    expect(container.scrollTop).toBe(850);
    expect(
      container
        .querySelector<HTMLElement>('[data-article-id="a5"]')!
        .getBoundingClientRect().top
    ).toBe(-50);
    expect(container.style.overflowAnchor).toBe('');
  });

  it('更新中に読み進めたら、その位置を保つ（更新前の位置へ巻き戻さない）', async () => {
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:1')
    );
    const container = document.getElementById('container')!;
    container.scrollTop = 550;

    let openGate: () => void = () => {};
    server.gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    server.ids = ['n1', 'n2', 'n3', ...OLD_IDS];
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    // 応答を待つ間に 200px 読み進め、a7 が上端から 50px はみ出した位置になる
    container.scrollTop = 750;
    fireEvent.scroll(container);
    openGate();

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:2')
    );
    await waitFor(() =>
      expect(
        container.querySelector('[data-article-id="n1"]')
      ).toBeInTheDocument()
    );
    expect(container.scrollTop).toBe(1050);
    expect(
      container
        .querySelector<HTMLElement>('[data-article-id="a7"]')!
        .getBoundingClientRect().top
    ).toBe(-50);
  });

  it('取り直しに失敗したら、位置を動かさずに基準を捨てる', async () => {
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:1')
    );
    const container = document.getElementById('container')!;
    container.scrollTop = 550;

    server.fail = true;
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    expect(container.style.overflowAnchor).toBe('none');

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('idle:1')
    );
    expect(container.scrollTop).toBe(550);
    expect(container.style.overflowAnchor).toBe('');
  });
});
