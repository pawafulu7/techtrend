'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  DigestResponse,
  DigestPeriod,
} from '@/lib/services/digest-service';

/** 画面で文言を選べるよう、HTTP ステータスを持たせる（issue #701） */
export class DigestFetchError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch digest: ${status}`);
    this.name = 'DigestFetchError';
  }
}

async function fetchDigest(
  period: DigestPeriod,
  signal?: AbortSignal
): Promise<DigestResponse> {
  const res = await fetch(`/api/digest?period=${period}`, { signal });
  if (!res.ok) {
    throw new DigestFetchError(res.status);
  }
  return res.json();
}

// 401 で失敗したクエリは、取り直してもログインし直すまで同じ結果になる。さらに data の無い
// クエリを取り直すと error が消えるため、その間ログインの案内が一般の失敗表示に変わってしまう。
// そこで 401 の後は、期間タブの切り替え（キーの変更）・再マウント・再接続で自動的に取り直さない
// （issue #701）。React Query がこれらの経路で共通に見るのは enabled だけ（refetchOnMount は
// data の無いクエリには効かない）。手動の refetch() は enabled を見ない
type DigestQuery = { state: { error: unknown; errorUpdatedAt: number } };
const isUnauthorizedQuery = (query: DigestQuery) =>
  query.state.error instanceof DigestFetchError &&
  query.state.error.status === 401;

export function useDigest(period: DigestPeriod) {
  // 止めるのは、この画面を開いてから起きた 401 だけ。メール・パスワードでログインし直すと
  // クライアント遷移で前の 401 がキャッシュに残るため、それで止めると案内が消えなくなる
  const [mountedAt] = useState(() => Date.now());
  const query = useQuery({
    queryKey: ['digest', period],
    queryFn: ({ signal }) => fetchDigest(period, signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: false,
    enabled: (query) =>
      !(isUnauthorizedQuery(query) && query.state.errorUpdatedAt >= mountedAt),
  });
  // この画面を開いてから失敗したか。errorUpdateCount はキャッシュに残るので、開き直した直後の
  // 取り直し（ログインし直した後など）を「失敗後の再試行」と取り違えないよう時刻で判断する
  const hasFailedSinceMount = query.errorUpdatedAt >= mountedAt;
  return { ...query, hasFailedSinceMount };
}
