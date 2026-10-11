'use client';

import { useEffect, useMemo } from 'react';
import {
  HydrationBoundary,
  useQueryClient,
  type DehydratedState,
} from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';

interface HydrateNewQueriesProps {
  state: DehydratedState;
  /**
   * サーバーがデータを取ったときのユーザー（ゲストは null）。ブラウザのセッションが
   * 別のユーザーに決まったら、入れたデータを取り直す
   */
  principal?: string | null;
  children: React.ReactNode;
}

/** 一度入れたサーバーのデータ（クエリと取得時刻の組）。ページを読み込み直すまで保つ */
const consumedServerData = new Set<string>();

function serverDataId(query: DehydratedState['queries'][number]): string {
  return `${query.queryHash}@${query.state.dataUpdatedAt}`;
}

/**
 * サーバーで取ったクエリのうち、クライアントのキャッシュにまだデータが無いものだけを入れる
 * （issue #714）。
 *
 * - HydrationBoundary は、キャッシュに既にあるクエリでもサーバーの方が新しければ上書きする。
 *   ホームの一覧は無限スクロールでページを積んでいるので、記事詳細から戻るなどのクライアント
 *   遷移で上書きされると、読み込み済みのページが1ページ目だけに戻り、スクロール位置の復元が
 *   効かなくなる。クライアントのキャッシュを優先するため、データのあるクエリは渡さない
 * - ブラウザの戻る・進むでは、最初の文書の要求で受け取った状態がそのまま再利用される。
 *   一度入れたサーバーのデータは二度と入れない（フィルターの変更で消したキーに古い
 *   1ページ目が戻り、取り直さずに表示されるのを防ぐ）
 * - サーバーとブラウザでユーザーが食い違ったら（サーバーで取った後にログアウトした等）、
 *   別のユーザーの既読・お気に入りを出さないよう、入れたデータを取り直す
 */
export function HydrateNewQueries({
  state,
  principal,
  children,
}: HydrateNewQueriesProps) {
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();

  const newState = useMemo<DehydratedState>(() => {
    const queryCache = queryClient.getQueryCache();
    return {
      ...state,
      queries: state.queries.filter(
        (query) =>
          !consumedServerData.has(serverDataId(query)) &&
          queryCache.get(query.queryHash)?.state.data === undefined
      ),
    };
  }, [queryClient, state]);

  // 消費済みの記録はコミットの後に行う（描画は破棄・やり直しがあるため）
  useEffect(() => {
    state.queries.forEach((query) =>
      consumedServerData.add(serverDataId(query))
    );
  }, [state]);

  const clientPrincipal = isPending ? undefined : (session?.user?.id ?? null);
  useEffect(() => {
    if (principal === undefined || clientPrincipal === undefined) return;
    if (clientPrincipal === principal) return;
    const queryCache = queryClient.getQueryCache();
    state.queries.forEach((query) => {
      const cached = queryCache.get(query.queryHash);
      // サーバーのデータのまま残っているものだけを取り直す
      if (cached?.state.dataUpdatedAt === query.state.dataUpdatedAt) {
        void queryClient.resetQueries({
          queryKey: query.queryKey,
          exact: true,
        });
      }
    });
  }, [principal, clientPrincipal, state, queryClient]);

  return <HydrationBoundary state={newState}>{children}</HydrationBoundary>;
}

/** テスト専用。消費済みのサーバーのデータの記録を消す */
export function resetConsumedServerDataForTests(): void {
  consumedServerData.clear();
}
