import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { QueryProvider } from '@/app/providers/query-provider';

/**
 * QueryProvider のキャッシュ破棄条件を固定する回帰テスト。
 *
 * 背景（ブランチ fix/forced-refetch-on-tab-return）:
 * - principal（ログインユーザー）が変わったときだけユーザー依存キャッシュを破棄する。
 *   発火条件を広く取ると「タブ復帰で一覧の内容が失われる」症状を別経路で再現するため、
 *   破棄する／しない遷移を 1 本ずつ固定する。
 * - better-auth はセッション失効時に 401 ではなく HTTP 200 + null を返す
 *   （node_modules/better-auth/dist/api/routes/session.mjs:182-191）ので、
 *   「X → undefined」はタブ復帰のたびに現実的に起きる経路である。
 */

type SessionState = {
  data: { user: { id: string } } | null;
  isPending: boolean;
  error: { status?: number } | null;
};

const SESSION_PENDING: SessionState = {
  data: null,
  isPending: true,
  error: null,
};
const SESSION_SIGNED_OUT: SessionState = {
  data: null,
  isPending: false,
  error: null,
};
const SESSION_UNAUTHORIZED: SessionState = {
  data: null,
  isPending: false,
  error: { status: 401 },
};
const signedInAs = (userId: string): SessionState => ({
  data: { user: { id: userId } },
  isPending: false,
  error: null,
});

// better-auth の client は ESM のため Jest では実体を読み込ませない。
const mockUseSession = jest.fn((): SessionState => SESSION_PENDING);
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signIn: { email: jest.fn(), social: jest.fn() },
    signOut: jest.fn(),
    signUp: { email: jest.fn() },
  },
}));

const USER_SCOPED_KEYS = [
  'infinite-articles',
  'infinite-favorites',
  'digest',
  // article-count は queryKey に principal を含まないため、ユーザー切替時に
  // 前ユーザーの件数（readFilter 付きなど）が残らないよう破棄対象に含める。
  'article-count',
];

// サインアウト（X → null）で破棄されるキャッシュ。infinite-articles は含まない
// （フィールドだけ剥がしてキャッシュは残す）。
const SIGNED_OUT_REMOVED_KEYS = [
  'infinite-favorites',
  'digest',
  'article-count',
];

let removeQueriesSpy: jest.SpyInstance;
let invalidateQueriesSpy: jest.SpyInstance;
let capturedClient: QueryClient | null = null;

// QueryProvider は QueryClient を内部の useState で生成するため注入できない。
// 子から useQueryClient() でその実体を取り出して検証に使う。
const captureClient = (client: QueryClient) => {
  capturedClient = client;
};

function ClientProbe({ onReady }: { onReady: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => {
    onReady(client);
  }, [client, onReady]);
  return null;
}

function renderProvider() {
  return render(
    <QueryProvider>
      <ClientProbe onReady={captureClient} />
    </QueryProvider>
  );
}

function removedQueryKeys(): string[] {
  return removeQueriesSpy.mock.calls.map((call) => {
    const filters = call[0] as { queryKey?: unknown } | undefined;
    const queryKey = filters?.queryKey;
    return Array.isArray(queryKey) ? String(queryKey[0]) : String(queryKey);
  });
}

function invalidatedQueryKeys(): string[] {
  return invalidateQueriesSpy.mock.calls.map((call) => {
    const filters = call[0] as { queryKey?: unknown } | undefined;
    const queryKey = filters?.queryKey;
    return Array.isArray(queryKey) ? String(queryKey[0]) : String(queryKey);
  });
}

type InvalidateFilters = { queryKey?: unknown; refetchType?: string };

function invalidateCallsFor(prefix: string): InvalidateFilters[] {
  return invalidateQueriesSpy.mock.calls
    .map((call) => call[0] as InvalidateFilters)
    .filter((filters) => {
      const queryKey = filters?.queryKey;
      return Array.isArray(queryKey) && queryKey[0] === prefix;
    });
}

beforeEach(() => {
  capturedClient = null;
  mockUseSession.mockReturnValue(SESSION_PENDING);
  // removeQueries / invalidateQueries はプロトタイプメソッドなので、
  // 内部生成される QueryClient に対してもマウント前から監視できる。
  removeQueriesSpy = jest.spyOn(QueryClient.prototype, 'removeQueries');
  invalidateQueriesSpy = jest.spyOn(QueryClient.prototype, 'invalidateQueries');
});

afterEach(() => {
  removeQueriesSpy.mockRestore();
  invalidateQueriesSpy.mockRestore();
});

describe('QueryProvider の principal 変化検知', () => {
  it('別ユーザーが現れたらユーザー依存キャッシュを破棄する', () => {
    // 別ユーザーに前ユーザーの一覧・お気に入り・ダイジェストが見えるのを防ぐ。
    // この 1 本だけが「破棄する」側の本来の目的なので、必ず発火し続ける必要がある。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    const { rerender } = renderProvider();

    // 初回解決では破棄しないことを先に確認しておく（下の期待値を汚さないため）
    expect(removedQueryKeys()).toEqual([]);

    mockUseSession.mockReturnValue(signedInAs('userB'));
    rerender(
      <QueryProvider>
        <ClientProbe onReady={captureClient} />
      </QueryProvider>
    );

    expect(removedQueryKeys()).toEqual(USER_SCOPED_KEYS);
  });

  it('セッションの初回解決（未解決 → ユーザー確定）では破棄しない', () => {
    // 破棄してしまうと、全画面がページロードごとに 1 回キャッシュを失い
    // 「開いた直後に一覧が消える」挙動になる。
    mockUseSession.mockReturnValue(SESSION_PENDING);
    const { rerender } = renderProvider();

    mockUseSession.mockReturnValue(signedInAs('userA'));
    rerender(
      <QueryProvider>
        <ClientProbe onReady={captureClient} />
      </QueryProvider>
    );

    expect(removedQueryKeys()).toEqual([]);
  });

  it('セッション失効・サインアウト（ユーザー確定 → 未認証）でも infinite-articles は破棄しない', () => {
    // better-auth は失効時に 200 + null を返すため sessionError が付かない。
    // ここで一覧まで破棄すると、タブ復帰のたびに読み込み済みの一覧が捨てられる
    // ＝このブランチで直している症状の再現になる。
    // 中身自体がユーザー固有なキャッシュ（お気に入り・ダイジェスト・件数）だけは
    // 破棄してよい。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    const { rerender } = renderProvider();

    mockUseSession.mockReturnValue(SESSION_SIGNED_OUT);
    rerender(
      <QueryProvider>
        <ClientProbe onReady={captureClient} />
      </QueryProvider>
    );

    expect(removedQueryKeys()).not.toContain('infinite-articles');
    expect(removedQueryKeys()).toEqual(SIGNED_OUT_REMOVED_KEYS);
  });

  it('サインアウトで infinite-articles のキャッシュは残しつつ isRead / isFavorited を剥がす', () => {
    // queryKey ['infinite-articles', filterKey] に userId は含まれず、ホームは
    // includeUserData: true で取得するため item が isRead / isFavorited を内包する。
    // パーソナライズ未使用なら filterKey がゲストと一致するので、剥がさないと
    // サインアウト直後のゲスト表示に前ユーザーの既読・お気に入りが出る。
    // ただし removeQueries に戻すと失効のたびに一覧が消えるため、
    // 「キャッシュは残す・フィールドだけ剥がす」の両方を同時に固定する。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    const { rerender } = renderProvider();

    const client = capturedClient;
    expect(client).not.toBeNull();

    const queryKey = ['infinite-articles', '{"sortBy":"publishedAt"}'];
    client!.setQueryData(queryKey, {
      pages: [
        {
          data: {
            items: [
              {
                id: 'article-1',
                title: '記事1',
                isRead: true,
                isFavorited: true,
              },
              {
                id: 'article-2',
                title: '記事2',
                isRead: false,
                isFavorited: false,
              },
            ],
          },
        },
      ],
      pageParams: [1],
    });

    mockUseSession.mockReturnValue(SESSION_SIGNED_OUT);
    rerender(
      <QueryProvider>
        <ClientProbe onReady={captureClient} />
      </QueryProvider>
    );

    const after = client!.getQueryData(queryKey) as
      | {
          pages: Array<{
            data: {
              items: Array<{
                id: string;
                title: string;
                isRead: boolean;
                isFavorited: boolean;
              }>;
            };
          }>;
        }
      | undefined;

    // キャッシュ自体が残っていること（読み込み済みページとスクロール位置の保持）
    expect(after).toBeDefined();
    expect(after!.pages[0].data.items).toEqual([
      { id: 'article-1', title: '記事1', isRead: false, isFavorited: false },
      { id: 'article-2', title: '記事2', isRead: false, isFavorited: false },
    ]);
  });

  it('401 由来の data: null では破棄しない', () => {
    // 401 は「別ユーザーが現れた」ことを意味しない。
    // 一時的な認証エラーでキャッシュ全体を失わせないためのガード。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    const { rerender } = renderProvider();

    mockUseSession.mockReturnValue(SESSION_UNAUTHORIZED);
    rerender(
      <QueryProvider>
        <ClientProbe onReady={captureClient} />
      </QueryProvider>
    );

    expect(removedQueryKeys()).toEqual([]);
  });

  it('サインアウトを挟んだ別ユーザーのログイン（X → 未認証 → Y）では破棄する', () => {
    // 「未認証では破棄しない」を前回値の上書きで実装すると、
    // X → null で前回値が null になり X → null → Y の破棄を取りこぼす。
    // 実装が「最後に確定した非 null の principal」を保持していることのガード。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    const { rerender } = renderProvider();

    const rerenderProvider = () =>
      rerender(
        <QueryProvider>
          <ClientProbe onReady={captureClient} />
        </QueryProvider>
      );

    mockUseSession.mockReturnValue(SESSION_SIGNED_OUT);
    rerenderProvider();
    // サインアウト時点では一覧は破棄されない（フィールドを剥がすだけ）
    expect(removedQueryKeys()).toEqual(SIGNED_OUT_REMOVED_KEYS);
    removeQueriesSpy.mockClear();

    mockUseSession.mockReturnValue(signedInAs('userB'));
    rerenderProvider();

    expect(removedQueryKeys()).toEqual(USER_SCOPED_KEYS);
  });
});

describe('QueryProvider の冗長な再取得の除去', () => {
  it('article-favorite-changed は楽観更新のみで完結し、一覧の再取得を起こさない', () => {
    // 以前は無条件で invalidateQueries していたため、お気に入りを 1 クリックする
    // だけで表示中の全ページ（N ページ）が refetchType: 'active' で再取得され、
    // 記事の並びが変わっていた。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    renderProvider();

    const client = capturedClient;
    expect(client).not.toBeNull();

    const queryKey = ['infinite-articles', '{"sortBy":"publishedAt"}'];
    client!.setQueryData(queryKey, {
      pages: [
        {
          data: {
            items: [
              { id: 'article-1', isFavorited: false },
              { id: 'article-2', isFavorited: false },
            ],
          },
        },
      ],
      pageParams: [1],
    });
    invalidateQueriesSpy.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-favorite-changed', {
          detail: {
            articleId: 'article-1',
            isFavorited: true,
            timestamp: Date.now(),
          },
        })
      );
    });

    // 楽観更新が実際に走ったこと（＝ハンドラ未実行による空振りでないこと）を確認
    const updated = client!.getQueryData(queryKey) as {
      pages: Array<{
        data: { items: Array<{ id: string; isFavorited: boolean }> };
      }>;
    };
    expect(updated.pages[0].data.items).toEqual([
      { id: 'article-1', isFavorited: true },
      { id: 'article-2', isFavorited: false },
    ]);

    // そのうえで ['infinite-articles'] の再取得は起こしていないこと
    expect(invalidatedQueryKeys()).not.toContain('infinite-articles');
  });

  it('article-favorite-changed は infinite-favorites を stale 化するが再取得はしない', () => {
    // refetchOnMount: false を入れた際、ここで stale マークをやめたために
    // 「/ でお気に入り追加 → /favorites へ遷移しても追加した記事が出ない」
    // 状態が最大 gcTime（30 分）続く回帰が起きた。
    // useInfiniteFavorites の利用者は /favorites のみで、未マウント中の変更を
    // フック内リスナーで拾えないため、ここで stale 化する必要がある。
    // ただし refetchType: 'none' であること（表示中の一覧を勝手に取り直さない）も
    // 同時に固定する。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    renderProvider();

    const client = capturedClient;
    expect(client).not.toBeNull();

    client!.setQueryData(['infinite-favorites'], {
      pages: [{ favorites: [], pagination: { total: 0 } }],
      pageParams: [1],
    });
    expect(client!.getQueryState(['infinite-favorites'])?.isInvalidated).toBe(
      false
    );
    invalidateQueriesSpy.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-favorite-changed', {
          detail: {
            articleId: 'article-1',
            isFavorited: true,
            timestamp: Date.now(),
          },
        })
      );
    });

    // stale マークされたこと（次回マウント時の refetchOnMount で最新が取れる）
    expect(client!.getQueryState(['infinite-favorites'])?.isInvalidated).toBe(
      true
    );
    // かつ、表示中のクエリを再取得しない指定であること
    expect(invalidateCallsFor('infinite-favorites')).toEqual([
      { queryKey: ['infinite-favorites'], refetchType: 'none' },
    ]);
  });

  it('refetchOnReconnect をグローバル既定に置かない（fetch 失敗後の自動復帰を全クエリから奪わない）', () => {
    // online イベントで全ページが取り直される問題はページを蓄積する infinite query
    // 固有なので、無効化は use-infinite-articles / use-infinite-favorites の 2 フックに
    // 個別指定する。グローバルに false を置くと、fetch 開始後に失敗したクエリ
    // （retry: 1 到達後の isError）がネットワーク復帰でも自動復帰しなくなる。
    mockUseSession.mockReturnValue(signedInAs('userA'));
    renderProvider();

    expect(capturedClient).not.toBeNull();
    expect(
      capturedClient!.getDefaultOptions().queries?.refetchOnReconnect
    ).toBeUndefined();
    // 併せて、フォーカス復帰による再取得はグローバルに無効であること
    expect(
      capturedClient!.getDefaultOptions().queries?.refetchOnWindowFocus
    ).toBe(false);
  });
});

/**
 * 既読関連の invalidate は各フックから provider へ一本化した。委譲先である
 * provider 側のハンドラが実際に invalidate していることを固定しないと、
 * provider のハンドラを削除しても全テストが緑のまま通ってしまう。
 */
describe('QueryProvider の既読イベント委譲', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue(signedInAs('userA'));
  });

  it('article-read-status-changed で read-status と digest を invalidate する', () => {
    renderProvider();
    invalidateQueriesSpy.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('article-read-status-changed', {
          detail: { articleId: 'article-1', isRead: true },
        })
      );
    });

    expect(invalidatedQueryKeys()).toContain('read-status');
    expect(invalidatedQueryKeys()).toContain('digest');
  });

  it('articles-bulk-read で infinite-articles・read-status・digest を invalidate する', () => {
    renderProvider();
    invalidateQueriesSpy.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('articles-bulk-read', { detail: { isRead: true } })
      );
    });

    // 一括既読は楽観更新では追いつかないため一覧そのものの再取得が必要
    expect(invalidateCallsFor('infinite-articles')).toEqual([
      { queryKey: ['infinite-articles'], refetchType: 'active' },
    ]);
    expect(invalidatedQueryKeys()).toContain('read-status');
    expect(invalidatedQueryKeys()).toContain('digest');
  });
});
