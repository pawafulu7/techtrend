/**
 * 管理画面の「利用の申請」の一覧の取得（TanStack Query のキー・取得の関数・取得の設定）
 *
 * 「サイトに入れるアカウント」の画面の一覧と、管理画面のメニューの件数（app/admin/_components/admin-sidebar.tsx）が
 * 同じキーで読み、片方の更新がもう片方にも出るようにする。先頭の 'admin' は QueryProvider がアカウントの
 * 切り替えで捨てる接頭辞（app/providers/query-provider.tsx）。サーバーの部品は読み込まない（画面から使う）
 */
import { queryOptions, type Query } from '@tanstack/react-query';
import type { GateAccessRequestsResponse } from './admin-types';

export const gateAccessRequestsQueryKey = ['admin', 'gate-requests'] as const;

/** 一覧の取得の失敗。401・403 を見分けるためにステータスを持つ */
export class GateAccessRequestsFetchError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch the gate access requests (${status})`);
    this.name = 'GateAccessRequestsFetchError';
  }
}

export async function fetchGateAccessRequests(
  signal?: AbortSignal
): Promise<GateAccessRequestsResponse> {
  const res = await fetch('/api/admin/gate-requests', { signal });
  if (!res.ok) throw new GateAccessRequestsFetchError(res.status);
  return res.json();
}

/** 401・403（ログイン切れ・管理者でない・入口の拒否）。取り直しても、入り直すまで同じ */
export function isGateAccessRequestsAuthFailure(error: unknown): boolean {
  return (
    error instanceof GateAccessRequestsFetchError &&
    (error.status === 401 || error.status === 403)
  );
}

/** 開いたままの管理画面で、申請の一覧を取り直す間隔 */
export const GATE_REQUESTS_REFETCH_INTERVAL_MS = 60_000;

/** 再接続・フォーカスで取り直すか。401・403 の間は取り直さない */
function canRefetchAutomatically(
  query: Query<GateAccessRequestsResponse, Error, GateAccessRequestsResponse, typeof gateAccessRequestsQueryKey>
): boolean {
  return !isGateAccessRequestsAuthFailure(query.state.error);
}

/**
 * 一覧とメニューの件数で共通の取得の設定。
 *
 * 再試行・networkMode は、同じキーでは取得を始めた側の設定が使われる（後から来た側は実行中の取得に
 * 相乗りするだけ）。メニューは画面より先に取得を始めるので、設定を別々に書くと画面の側の設定が効かない。
 * 両方がこれをそのまま使い、変えるのは staleTime だけにする。
 */
export const gateAccessRequestsQueryOptions = queryOptions({
  queryKey: gateAccessRequestsQueryKey,
  queryFn: ({ signal }) => fetchGateAccessRequests(signal),
  // オフラインでも一時停止させずにすぐ失敗させる（許可・却下のあとの取り直しが止まると、確認のダイアログを閉じられない）
  networkMode: 'always',
  // networkMode が always だと再接続での取り直しが既定で切れるので、明示して戻す
  refetchOnReconnect: canRefetchAutomatically,
  // 別の管理者の対応や新しい申請も、タブに戻れば出るようにする
  refetchOnWindowFocus: canRefetchAutomatically,
  staleTime: 30_000,
  // 管理画面を開いたままでも新しい申請に気づけるよう、1 分ごとに取り直す（メニューの件数のため。
  // タブが裏にある間は止まる）。401・403 の間は止める
  refetchInterval: (query) =>
    isGateAccessRequestsAuthFailure(query.state.error)
      ? false
      : GATE_REQUESTS_REFETCH_INTERVAL_MS,
  // 401・403 は取り直しても同じなので再試行しない。それ以外は 1 回だけ再試行する
  retry: (failureCount, cause) =>
    !isGateAccessRequestsAuthFailure(cause) && failureCount < 1,
});
