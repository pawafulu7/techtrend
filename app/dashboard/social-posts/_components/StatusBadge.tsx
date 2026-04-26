import type { SocialPostStatus } from '@/lib/social-post/types';

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
      'bg-[var(--tt-color-status-draft-icon-bg)] text-[var(--tt-color-status-draft-text)]',
  },
  REVIEWED: {
    label: 'レビュー済',
    colors:
      'bg-[var(--tt-color-status-reviewed-icon-bg)] text-[var(--tt-color-status-reviewed-text)]',
  },
  SCHEDULED: {
    label: '予約済',
    colors:
      'bg-[var(--tt-color-status-scheduled-icon-bg)] text-[var(--tt-color-status-scheduled-text)]',
  },
  POSTING: {
    label: '投稿中',
    colors:
      'bg-[var(--tt-color-status-posting-icon-bg)] text-[var(--tt-color-status-posting-text)]',
  },
  POSTED: {
    label: '投稿完了',
    colors:
      'bg-[var(--tt-color-status-posted-icon-bg)] text-[var(--tt-color-status-posted-text)]',
  },
  FAILED: {
    label: '失敗',
    colors:
      'bg-[var(--tt-color-status-failed-icon-bg)] text-[var(--tt-color-status-failed-text)]',
  },
  ARCHIVED: {
    label: 'アーカイブ',
    colors:
      'bg-[var(--tt-color-status-archived-icon-bg)] text-[var(--tt-color-status-archived-text)]',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    colors:
      'bg-[var(--tt-color-status-neutral-icon-bg)] text-[var(--tt-color-status-neutral-text)]',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.colors}`}
    >
      {config.label}
    </span>
  );
}
