import type { SocialPostStatus } from '@/lib/social-post';

interface StatusBadgeProps {
  status: SocialPostStatus;
}

const STATUS_CONFIG: Record<
  SocialPostStatus,
  {
    label: string;
    colors: string;
  }
> = {
  DRAFT: {
    label: '下書き',
    colors:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  REVIEWED: {
    label: 'レビュー済',
    colors: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  },
  SCHEDULED: {
    label: '予約済',
    colors:
      'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  },
  POSTING: {
    label: '投稿中',
    colors:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  POSTED: {
    label: '投稿完了',
    colors:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  FAILED: {
    label: '失敗',
    colors: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  },
  ARCHIVED: {
    label: 'アーカイブ',
    colors: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    colors: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.colors}`}
    >
      {config.label}
    </span>
  );
}
