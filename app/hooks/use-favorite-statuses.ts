'use client';

import { useQuery, type Query, type QueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';

/**
 * 一覧画面のお気に入り状態を POST /api/favorites/batch でまとめて取得する（issue #653）
 *
 * カードごとに GET /api/favorites/{id} を呼ぶと、1 画面で最大 100 リクエストになる。
 * 画面に並ぶ記事 ID をまとめて問い合わせ、カードには結果を isFavorited として渡す。
 *
 * - トグル後の同期は syncFavoriteStatusesCache（app/providers/query-provider.tsx の
 *   article-favorite-changed ハンドラから呼ぶ）
 * - ログアウト・ユーザー切替で破棄する（同 provider の *_QUERY_KEY_PREFIXES）
 */

export const FAVORITE_STATUSES_QUERY_KEY = ['favorite-statuses'] as const;

// app/api/favorites/batch の articleIds の上限（zod の max(100)）
export const FAVORITE_STATUSES_BATCH_SIZE = 100;

export type FavoriteStatuses = Record<string, boolean>;

const EMPTY_STATUSES: FavoriteStatuses = {};

function favoriteStatusesQueryKey(
  userId: string | undefined,
  sortedUniqueIds: string[]
) {
  return [...FAVORITE_STATUSES_QUERY_KEY, userId, sortedUniqueIds] as const;
}

class FavoriteStatusesHttpError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch favorite statuses (HTTP ${status})`);
    this.name = 'FavoriteStatusesHttpError';
  }
}

async function fetchFavoriteStatusesChunk(
  articleIds: string[],
  signal: AbortSignal
): Promise<FavoriteStatuses> {
  const response = await fetch('/api/favorites/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ articleIds }),
    signal,
  });
  if (!response.ok) {
    throw new FavoriteStatusesHttpError(response.status);
  }

  const data: unknown = await response.json();
  const favorites =
    typeof data === 'object' && data !== null && 'favorites' in data
      ? data.favorites
      : undefined;
  if (typeof favorites !== 'object' || favorites === null) {
    throw new Error('Invalid favorite statuses response');
  }

  // 応答に無い ID を「未登録」と誤表示しないよう、要求した ID がすべて
  // 真偽値で返っていることを確かめる
  const result: FavoriteStatuses = {};
  for (const articleId of articleIds) {
    const value: unknown = Object.hasOwn(favorites, articleId)
      ? (favorites as Record<string, unknown>)[articleId]
      : undefined;
    if (typeof value !== 'boolean') {
      throw new Error('Invalid favorite statuses response');
    }
    result[articleId] = value;
  }
  return result;
}

export async function fetchFavoriteStatuses(
  articleIds: string[],
  signal: AbortSignal
): Promise<FavoriteStatuses> {
  const chunks: string[][] = [];
  for (let i = 0; i < articleIds.length; i += FAVORITE_STATUSES_BATCH_SIZE) {
    chunks.push(articleIds.slice(i, i + FAVORITE_STATUSES_BATCH_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) => fetchFavoriteStatusesChunk(chunk, signal))
  );
  const merged: FavoriteStatuses = {};
  for (const result of results) {
    for (const [articleId, isFavorited] of Object.entries(result)) {
      merged[articleId] = isFavorited;
    }
  }
  return merged;
}

// 4xx（未認証・CSRF 拒否・レート制限など）は再試行しても結果が変わらない。
// 再試行するとカード側の個別取得への切り替えが遅れるだけなので、5xx と
// ネットワーク例外だけを 1 回再試行する（QueryProvider の既定 retry: 1 に合わせる）
function shouldRetry(failureCount: number, error: Error): boolean {
  if (error instanceof FavoriteStatusesHttpError && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/**
 * @param articleIds 画面に並ぶ記事 ID（重複・順不同でよい）
 * @returns statuses は未取得・未ログインのとき空。isLoading の間はボタンを
 *   取得中の表示にし、isError のときはカード側の個別取得（fetchInitialStatus）に
 *   戻すこと。未取得を「未登録」と表示しないため
 */
export function useFavoriteStatuses(articleIds: readonly string[]): {
  statuses: FavoriteStatuses;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const userId = session?.user?.id;

  // 並び順や重複が違っても同じクエリを使い回すため、キーは重複除去・ソート済みにする
  const sortedUniqueIds = [...new Set(articleIds)].sort();
  // 未ログイン・セッション確定前（userId が未確定）は取得しない
  const enabled = Boolean(userId) && sortedUniqueIds.length > 0;

  const query = useQuery({
    queryKey: favoriteStatusesQueryKey(userId, sortedUniqueIds),
    queryFn: ({ signal }) => fetchFavoriteStatuses(sortedUniqueIds, signal),
    enabled,
    // 別タブ・別端末での変更は article-favorite-changed で届かない。旧実装
    // （カードのマウントごとの個別 GET）と同じく、画面を開くたびに取り直す。
    // 取り直しの間はキャッシュの結果を表示するので、読み込み中には戻らない
    staleTime: 0,
    retry: shouldRetry,
  });

  return {
    statuses: query.data ?? EMPTY_STATUSES,
    // セッション確定前（旧実装の個別取得と同じく取得中の表示にする）と、
    // データが無いまま取得中・オフラインで保留中のとき
    isLoading: (isSessionPending && !userId) || (enabled && query.isPending),
    isError: query.isError,
  };
}

/**
 * トグル結果を useFavoriteStatuses のキャッシュに反映する
 *
 * 書き換えないと、カードが再マウントされたときにトグル前の状態が表示される。
 * 取得中のバッチはトグル前のサーバー状態を返しうるので先に取り消す（取り消さないと、
 * 遅れて届いた応答で表示が巻き戻る）。データが無いまま取り消したクエリは止まった
 * ままになるので取り直す。イベントはトグルの API 成功後に届くため、取り直せば
 * トグル後の状態が返る。
 *
 * @param userId トグルしたユーザー。指定があれば、そのユーザーのクエリだけを対象に
 *   する（ログアウト → 別ユーザーでログインした後に、前のユーザーのトグル完了が
 *   届いても書き換えない）
 */
export async function syncFavoriteStatusesCache(
  queryClient: QueryClient,
  articleId: string,
  isFavorited: boolean,
  userId?: string
): Promise<void> {
  // queryKey の形は favoriteStatusesQueryKey と同じ [prefix, userId, sortedUniqueIds]
  const isTarget = (query: Query) => {
    const [, queryUserId, ids] = query.queryKey;
    if (userId !== undefined && queryUserId !== userId) return false;
    return Array.isArray(ids) && ids.includes(articleId);
  };
  const filters = {
    queryKey: FAVORITE_STATUSES_QUERY_KEY,
    predicate: isTarget,
  };

  const stalledWithoutData = new Set(
    queryClient
      .getQueryCache()
      .findAll(filters)
      .filter(
        (query) =>
          query.state.fetchStatus !== 'idle' && query.state.data === undefined
      )
      .map((query) => query.queryHash)
  );

  // 取り消し（取得前の状態への巻き戻し）を終えてから書き換える。
  // TanStack Query 5.101 では巻き戻しは同期的に終わるが、順序をライブラリの
  // 実装に依存させないために完了を待つ
  await queryClient.cancelQueries(filters);

  // 対象のクエリだけを書き換える。updater が oldData をそのまま返しても
  // setData が走り、無関係なクエリが「最新」扱いになるため、filters で絞る
  queryClient.setQueriesData<FavoriteStatuses>(filters, (oldData) =>
    oldData ? { ...oldData, [articleId]: isFavorited } : undefined
  );

  if (stalledWithoutData.size > 0) {
    await queryClient.refetchQueries({
      queryKey: FAVORITE_STATUSES_QUERY_KEY,
      type: 'active',
      predicate: (query) => stalledWithoutData.has(query.queryHash),
    });
  }
}
