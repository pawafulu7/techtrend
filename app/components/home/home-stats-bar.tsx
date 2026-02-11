'use client';

import { Newspaper, Clock, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface HomeStatsBarProps {
  totalCount: number;
  todayCount: number;
}

export function HomeStatsBar({ totalCount, todayCount }: HomeStatsBarProps) {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    async function fetchUnread() {
      try {
        const res = await fetch(
          '/api/articles?readFilter=unread&lightweight=true&limit=1&excludeUnprocessed=true&includeEmptyContent=true'
        );
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data?.data?.total ?? data?.total ?? 0);
        }
      } catch {
        /* ignore */
      }
    }
    fetchUnread();
  }, [session?.user]);

  return (
    <div className="bg-background flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Newspaper
          className="h-4 w-4 text-(--tt-color-primary)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">
          {totalCount.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-xs">記事</span>
      </div>
      <div className="bg-border hidden h-4 w-px sm:block" />
      <div className="flex items-center gap-2">
        <Clock
          className="h-4 w-4 text-(--tt-color-secondary)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold">
          {todayCount.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-xs">今日の新着</span>
      </div>
      {session?.user && (
        <>
          <div className="bg-border hidden h-4 w-px sm:block" />
          <div className="flex items-center gap-2">
            <Eye
              className="h-4 w-4 text-(--tt-color-info)"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold">
              {unreadCount !== null ? (
                unreadCount.toLocaleString()
              ) : (
                <span className="inline-block h-4 w-8 animate-pulse rounded bg-(--tt-color-surface-muted)" />
              )}
            </span>
            <span className="text-muted-foreground text-xs">未読</span>
          </div>
        </>
      )}
    </div>
  );
}
