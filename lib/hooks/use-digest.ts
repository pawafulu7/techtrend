'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  DigestResponse,
  DigestPeriod,
} from '@/lib/services/digest-service';

async function fetchDigest(
  period: DigestPeriod,
  signal?: AbortSignal
): Promise<DigestResponse> {
  const res = await fetch(`/api/digest?period=${period}`, { signal });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('ログインが必要です');
    }
    throw new Error(`Failed to fetch digest: ${res.status}`);
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
