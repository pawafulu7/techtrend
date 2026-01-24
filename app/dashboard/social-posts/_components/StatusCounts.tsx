'use client';

import useSWR from 'swr';
import type { SocialPostStatus } from '@/lib/social-post';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  textColor: string;
  iconBg: string;
}

const STATUS_CONFIG: Record<SocialPostStatus | 'total', StatusConfig> = {
  total: {
    label: '総数',
    icon: <StackIcon />,
    gradient:
      'from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900',
    textColor: 'text-slate-900 dark:text-slate-100',
    iconBg: 'bg-slate-200 dark:bg-slate-700',
  },
  DRAFT: {
    label: '下書き',
    icon: <PencilIcon />,
    gradient:
      'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30',
    textColor: 'text-amber-700 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  REVIEWED: {
    label: 'レビュー済',
    icon: <CheckCircleIcon />,
    gradient: 'from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/30',
    textColor: 'text-sky-700 dark:text-sky-400',
    iconBg: 'bg-sky-100 dark:bg-sky-900/50',
  },
  SCHEDULED: {
    label: '予約済',
    icon: <ClockIcon />,
    gradient:
      'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30',
    textColor: 'text-violet-700 dark:text-violet-400',
    iconBg: 'bg-violet-100 dark:bg-violet-900/50',
  },
  POSTING: {
    label: '投稿中',
    icon: <LoadingIcon />,
    gradient:
      'from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30',
    textColor: 'text-yellow-700 dark:text-yellow-400',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/50',
  },
  POSTED: {
    label: '投稿完了',
    icon: <CheckIcon />,
    gradient:
      'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  FAILED: {
    label: '失敗',
    icon: <AlertIcon />,
    gradient: 'from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30',
    textColor: 'text-rose-700 dark:text-rose-400',
    iconBg: 'bg-rose-100 dark:bg-rose-900/50',
  },
  ARCHIVED: {
    label: 'アーカイブ',
    icon: <ArchiveIcon />,
    gradient:
      'from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30',
    textColor: 'text-gray-500 dark:text-gray-400',
    iconBg: 'bg-gray-100 dark:bg-gray-800',
  },
};

export function StatusCounts() {
  const { data, error, isLoading } = useSWR<
    Record<SocialPostStatus | 'total', number>
  >('/api/admin/social-posts/stats', fetcher, { refreshInterval: 60000 });

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/30">
        <p className="text-sm text-rose-700 dark:text-rose-400">
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
            className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-2">
                <div className="h-3 w-12 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-6 w-8 rounded bg-slate-200 dark:bg-slate-700" />
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
            className={`group relative overflow-hidden rounded-xl border border-slate-200/60 bg-gradient-to-br ${config.gradient} p-4 transition-all duration-200 hover:border-slate-300 hover:shadow-md dark:border-slate-700/60 dark:hover:border-slate-600`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.iconBg} transition-transform duration-200 group-hover:scale-105`}
              >
                <span className={config.textColor}>{config.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
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
