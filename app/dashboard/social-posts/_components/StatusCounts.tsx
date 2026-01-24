'use client';

import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import type { SocialPostStatus } from '@/lib/social-post';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

const STATUS_LABELS: Record<
  SocialPostStatus | 'total',
  { label: string; color: string }
> = {
  DRAFT: { label: '下書き', color: 'text-gray-600' },
  REVIEWED: { label: 'レビュー済', color: 'text-blue-600' },
  SCHEDULED: { label: '予約済', color: 'text-purple-600' },
  POSTING: { label: '投稿中', color: 'text-yellow-600' },
  POSTED: { label: '投稿完了', color: 'text-green-600' },
  FAILED: { label: '失敗', color: 'text-red-600' },
  ARCHIVED: { label: 'アーカイブ', color: 'text-gray-400' },
  total: { label: '総数', color: 'text-foreground' },
};

export function StatusCounts() {
  const { data, error, isLoading } = useSWR<
    Record<SocialPostStatus | 'total', number>
  >('/api/admin/social-posts/stats', fetcher, { refreshInterval: 60000 });

  if (error) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="col-span-full">
          <CardContent className="p-4">
            <p className="text-destructive text-sm">
              データの取得に失敗しました
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="mb-2 h-4 w-16 rounded bg-gray-200" />
                <div className="h-6 w-12 rounded bg-gray-200" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const mainStatuses: Array<SocialPostStatus | 'total'> = [
    'total',
    'DRAFT',
    'REVIEWED',
    'POSTED',
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {mainStatuses.map((status) => {
        const config = STATUS_LABELS[status];
        const count = data[status] ?? 0;

        return (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-sm">{config.label}</p>
              <p className={`text-2xl font-bold ${config.color}`}>{count}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
