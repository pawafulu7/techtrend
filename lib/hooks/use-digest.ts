'use client';

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

export function useDigest(period: DigestPeriod) {
  return useQuery({
    queryKey: ['digest', period],
    queryFn: ({ signal }) => fetchDigest(period, signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: false,
  });
}
