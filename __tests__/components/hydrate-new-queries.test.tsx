/**
 * HydrateNewQueries（issue #714）。
 *
 * サーバーで取ったクエリは、クライアントのキャッシュにまだデータが無いものだけを入れる。
 * HydrationBoundary はサーバーの方が新しければ既存のクエリも上書きするため、記事詳細から
 * 戻るなどのクライアント遷移で、積んだページが1ページ目だけに戻ってしまう。
 */

import { act, render } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from '@tanstack/react-query';
import {
  HydrateNewQueries,
  resetConsumedServerDataForTests,
} from '@/app/providers/hydrate-new-queries';

const mockUseSession = jest.fn();
jest.mock('@/lib/auth/auth-client', () => ({
  authClient: { useSession: () => mockUseSession() },
}));

function serverState() {
  const server = new QueryClient();
  server.setQueryData(['infinite-articles', 'loaded'], {
    pages: ['server-page-1'],
    pageParams: [1],
  });
  server.setQueryData(['infinite-articles', 'new'], {
    pages: ['server-page-1'],
    pageParams: [1],
  });
  return dehydrate(server);
}

describe('HydrateNewQueries', () => {
  beforeEach(() => {
    resetConsumedServerDataForTests();
    mockUseSession.mockReturnValue({ data: null, isPending: true });
  });

  it('データの無いクエリだけを入れ、クライアントのデータは上書きしない', async () => {
    const client = new QueryClient();
    client.setQueryData(
      ['infinite-articles', 'loaded'],
      { pages: ['client-page-1', 'client-page-2'], pageParams: [1, 2] },
      // サーバーより古い取得時刻にする（HydrationBoundary なら上書きされる条件）
      { updatedAt: 1 }
    );

    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <HydrateNewQueries state={serverState()}>
            <div />
          </HydrateNewQueries>
        </QueryClientProvider>
      );
    });

    expect(client.getQueryData(['infinite-articles', 'loaded'])).toEqual({
      pages: ['client-page-1', 'client-page-2'],
      pageParams: [1, 2],
    });
    expect(client.getQueryData(['infinite-articles', 'new'])).toEqual({
      pages: ['server-page-1'],
      pageParams: [1],
    });
  });

  it('子の初回描画の前に入れる（サーバー描画と同じ内容で hydrate するため）', () => {
    const client = new QueryClient();
    let seenInFirstRender: unknown;
    function Child() {
      seenInFirstRender ??= client.getQueryData(['infinite-articles', 'new']);
      return null;
    }

    render(
      <QueryClientProvider client={client}>
        <HydrateNewQueries state={serverState()}>
          <Child />
        </HydrateNewQueries>
      </QueryClientProvider>
    );

    expect(seenInFirstRender).toEqual({
      pages: ['server-page-1'],
      pageParams: [1],
    });
  });

  it('同じサーバーのデータは二度入れない（ブラウザの戻るで最初の状態が再利用されても）', async () => {
    const client = new QueryClient();
    const state = serverState();
    const ui = (
      <QueryClientProvider client={client}>
        <HydrateNewQueries state={state}>
          <div />
        </HydrateNewQueries>
      </QueryClientProvider>
    );

    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(ui);
    });
    expect(client.getQueryData(['infinite-articles', 'new'])).toBeDefined();

    // フィルターの変更でキーが消えた後に、戻るで同じ状態が届く
    view!.unmount();
    client.removeQueries({ queryKey: ['infinite-articles', 'new'] });
    await act(async () => {
      render(ui);
    });

    expect(client.getQueryData(['infinite-articles', 'new'])).toBeUndefined();
  });

  it('ブラウザのセッションがサーバーと別のユーザーに決まったら、入れたデータを取り直す', async () => {
    const client = new QueryClient();
    const state = serverState();
    // 同じ状態で描き直す（要素は毎回作る。同じ要素だと React が描き直しを省く）
    const ui = () => (
      <QueryClientProvider client={client}>
        <HydrateNewQueries state={state} principal="user-1">
          <div />
        </HydrateNewQueries>
      </QueryClientProvider>
    );

    const { rerender } = render(ui());
    expect(client.getQueryData(['infinite-articles', 'new'])).toEqual({
      pages: ['server-page-1'],
      pageParams: [1],
    });

    // サーバーで取った後にログアウトしていた
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    await act(async () => {
      rerender(ui());
    });

    expect(client.getQueryData(['infinite-articles', 'new'])).toBeUndefined();
  });

  it('同じユーザーに決まったら、入れたデータをそのまま使う', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
    });
    const client = new QueryClient();

    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <HydrateNewQueries state={serverState()} principal="user-1">
            <div />
          </HydrateNewQueries>
        </QueryClientProvider>
      );
    });

    expect(client.getQueryData(['infinite-articles', 'new'])).toEqual({
      pages: ['server-page-1'],
      pageParams: [1],
    });
  });
});
