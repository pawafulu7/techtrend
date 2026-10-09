import { cn } from '@/lib/utils';

// 一覧のカードで使うメタ情報の部品。彩色はブランド色（状態）だけにし、
// ソースは無彩色の文字で出す（ソースごとの色は一覧を騒がしくするため。issue #702）

/** ソース名。ソースごとの色は付けない */
export function SourceLabel({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'min-w-0 truncate font-medium text-(--tt-color-text-muted)',
        className
      )}
      title={name}
      data-testid="article-source"
    >
      {name}
    </span>
  );
}

/** 未読の印。ストーリーのまとめ（story-members.tsx）と同じ緑の点 */
export function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full bg-(--tt-color-primary)',
        className
      )}
      role="img"
      aria-label="未読"
      title="未読"
      data-testid="unread-badge"
    />
  );
}

/** 24時間以内の記事の印。点滅させない */
export function NewLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 font-medium text-(--tt-color-positive)',
        className
      )}
      title="24時間以内の新着記事"
      data-testid="new-label"
    >
      新着
    </span>
  );
}
