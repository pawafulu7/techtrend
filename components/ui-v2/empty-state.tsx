import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  /** 何が無いかを書く（例: 「お気に入り記事がありません」） */
  title: string;
  /** 次に何をすればよいかを書く */
  description?: string;
  /** compact: カードやチャート枠の中に埋め込む。block: ページの中央に置く */
  size?: 'compact' | 'block';
  className?: string;
  /** 次の操作（フィルターのリセット・記事を探すリンクなど） */
  children?: ReactNode;
}

/**
 * 取得に成功して0件だったときの表示（issue #701）。ErrorState と同じ骨格で、
 * 失敗と見分けられるよう無彩色のアイコンにし、再試行ではなく次の操作を出す。
 * 枠（CardV2 など）は呼び出し側が決める。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  size = 'block',
  className,
  children,
}: EmptyStateProps) {
  const isBlock = size === 'block';

  return (
    <div
      data-testid="empty-state"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isBlock ? 'px-4 py-12' : 'px-4 py-6',
        className
      )}
    >
      <div role="status" className="flex flex-col items-center">
        {isBlock ? (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--tt-color-surface-muted)">
            <Icon
              className="h-7 w-7 text-(--tt-color-text-muted)"
              aria-hidden="true"
            />
          </div>
        ) : (
          <Icon
            className="mb-2 h-5 w-5 text-(--tt-color-text-muted)"
            aria-hidden="true"
          />
        )}
        <p
          className={cn(
            'text-(--tt-color-text)',
            isBlock ? 'mb-2 text-base font-medium' : 'text-sm font-medium'
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              'max-w-md text-(--tt-color-text-muted)',
              isBlock ? 'text-sm' : 'mt-1 text-xs'
            )}
          >
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-2',
            isBlock ? 'mt-6' : 'mt-3'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
