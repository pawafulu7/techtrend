'use client';

import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth/auth-client';

/**
 * 一覧画面のお気に入り状態を POST /api/favorites/batch でまとめて取得する（issue #653）
 *
 * カードごとに GET /api/favorites/{id} を呼ぶと、1 画面で最大 100 リクエストになる。
 * 画面に並ぶ記事 ID をまとめて問い合わせ、カードには結果を isFavorited として渡す。
 *
 * - トグル後の同期は app/providers/query-provider.tsx の article-favorite-changed
 *   ハンドラがこのクエリを書き換えて行う（取得中のバッチは取り消してから取り直す）
 * - ログアウトで破棄する（同 provider の SIGNED_OUT_REMOVED_QUERY_KEY_PREFIXES）
 */

export const FAVORITE_STATUSES_QUERY_KEY = ['favorite-statuses'] as const;

// app/api/favorites/batch の articleIds の上限（zod の max(100)）
export const FAVORITE_STATUSES_BATCH_SIZE = 100;

export type FavoriteStatuses = Record<string, boolean>;

const EMPTY_STATUSES: FavoriteStatuses = {};

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
    throw new Error(
      `Failed to fetch favorite statuses (HTTP ${response.status})`
    );
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
  return Object.assign({}, ...results);
}

/**
 * @param articleIds 画面に並ぶ記事 ID（重複・順不同でよい）
 * @returns statuses は未取得・未ログインのとき空。isError のときはカード側の
 *   個別取得（fetchInitialStatus）に戻すこと。未取得を「未登録」と表示しないため
 */
export function useFavoriteStatuses(articleIds: readonly string[]): {
  statuses: FavoriteStatuses;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  // 並び順や重複が違っても同じクエリを使い回すため、キーは重複除去・ソート済みにする
  const sortedUniqueIds = [...new Set(articleIds)].sort();

  const query = useQuery({
    queryKey: [...FAVORITE_STATUSES_QUERY_KEY, userId, sortedUniqueIds],
    queryFn: ({ signal }) => fetchFavoriteStatuses(sortedUniqueIds, signal),
    // 未ログイン・セッション確定前（userId が未確定）は取得しない
    enabled: Boolean(userId) && sortedUniqueIds.length > 0,
  });

  return {
    statuses: query.data ?? EMPTY_STATUSES,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
