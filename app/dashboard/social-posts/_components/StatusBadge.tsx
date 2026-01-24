import { Badge } from '@/components/ui/badge';
import type { SocialPostStatus } from '@/lib/social-post';

interface StatusBadgeProps {
  status: SocialPostStatus;
}

const STATUS_CONFIG: Record<
  SocialPostStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  DRAFT: { label: '下書き', variant: 'secondary' },
  REVIEWED: { label: 'レビュー済', variant: 'default' },
  SCHEDULED: { label: '予約済', variant: 'outline' },
  POSTING: { label: '投稿中', variant: 'outline' },
  POSTED: { label: '投稿完了', variant: 'default' },
  FAILED: { label: '失敗', variant: 'destructive' },
  ARCHIVED: { label: 'アーカイブ', variant: 'secondary' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    variant: 'secondary' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
