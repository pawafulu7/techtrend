'use client';

import { useQuery } from '@tanstack/react-query';
import type { SocialPostStatus } from '@/lib/social-post/types';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  bg: string;
  textColor: string;
  iconBg: string;
}

const STATUS_CONFIG: Record<SocialPostStatus | 'total', StatusConfig> = {
  total: {
    label: '総数',
    icon: <StackIcon />,
    bg: 'bg-[var(--tt-color-status-neutral-bg)]',
    textColor: 'text-[var(--tt-color-status-neutral-text)]',
    iconBg: 'bg-[var(--tt-color-status-neutral-icon-bg)]',
  },
  DRAFT: {
    label: '下書き',
    icon: <PencilIcon />,
    bg: 'bg-[var(--tt-color-status-draft-bg)]',
    textColor: 'text-[var(--tt-color-status-draft-text)]',
    iconBg: 'bg-[var(--tt-color-status-draft-icon-bg)]',
  },
  REVIEWED: {
    label: 'レビュー済',
    icon: <CheckCircleIcon />,
    bg: 'bg-[var(--tt-color-status-reviewed-bg)]',
    textColor: 'text-[var(--tt-color-status-reviewed-text)]',
    iconBg: 'bg-[var(--tt-color-status-reviewed-icon-bg)]',
  },
  SCHEDULED: {
    label: '予約済',
    icon: <ClockIcon />,
    bg: 'bg-[var(--tt-color-status-scheduled-bg)]',
    textColor: 'text-[var(--tt-color-status-scheduled-text)]',
    iconBg: 'bg-[var(--tt-color-status-scheduled-icon-bg)]',
  },
  POSTING: {
    label: '投稿中',
    icon: <LoadingIcon />,
    bg: 'bg-[var(--tt-color-status-posting-bg)]',
    textColor: 'text-[var(--tt-color-status-posting-text)]',
    iconBg: 'bg-[var(--tt-color-status-posting-icon-bg)]',
  },
  POSTED: {
    label: '投稿完了',
    icon: <CheckIcon />,
    bg: 'bg-[var(--tt-color-status-posted-bg)]',
    textColor: 'text-[var(--tt-color-status-posted-text)]',
    iconBg: 'bg-[var(--tt-color-status-posted-icon-bg)]',
  },
  FAILED: {
    label: '失敗',
    icon: <AlertIcon />,
    bg: 'bg-[var(--tt-color-status-failed-bg)]',
    textColor: 'text-[var(--tt-color-status-failed-text)]',
    iconBg: 'bg-[var(--tt-color-status-failed-icon-bg)]',
  },
  ARCHIVED: {
    label: 'アーカイブ',
    icon: <ArchiveIcon />,
    bg: 'bg-[var(--tt-color-status-archived-bg)]',
    textColor: 'text-[var(--tt-color-status-archived-text)]',
    iconBg: 'bg-[var(--tt-color-status-archived-icon-bg)]',
  },
};

export function StatusCounts() {
  const { data, error, isLoading } = useQuery<
    Record<SocialPostStatus | 'total', number>
  >({
    queryKey: ['social-posts-stats'],
    queryFn: () => fetcher('/api/admin/social-posts/stats'),
    refetchInterval: 60000,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--tt-color-negative-border)] bg-[var(--tt-color-negative-bg)] p-4">
        <p className="text-sm text-[var(--tt-color-negative)]">
          データの取得に失敗しました
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-[var(--tt-color-border)] bg-[var(--tt-color-surface-muted)] p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-[var(--tt-color-surface-hover)]" />
              <div className="space-y-2">
                <div className="h-3 w-12 rounded bg-[var(--tt-color-surface-hover)]" />
                <div className="h-6 w-8 rounded bg-[var(--tt-color-surface-hover)]" />
              </div>
            </div>
          </div>
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {mainStatuses.map((status) => {
        const config = STATUS_CONFIG[status];
        const count = data[status] ?? 0;

        return (
          <div
            key={status}
            className={`group relative overflow-hidden rounded-xl border border-[var(--tt-color-border)] ${config.bg} p-4 transition-all duration-200 hover:border-[var(--tt-color-border-hover)] hover:shadow-md`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.iconBg} transition-transform duration-200 group-hover:scale-105`}
              >
                <span className={config.textColor}>{config.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[var(--tt-color-text-muted)]">
                  {config.label}
                </p>
                <p
                  className={`text-2xl font-bold tracking-tight ${config.textColor}`}
                >
                  {count.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function StackIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      className="h-5 w-5 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    </svg>
  );
}
