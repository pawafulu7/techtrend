import type React from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** アイコンコンポーネント（lucide-react等） */
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** ページタイトル（h1として表示） */
  title: string;
  /** 説明文（オプション） */
  description?: string;
  /** 件数表示（オプション、aria-live対応） */
  count?: { value: number; label: string };
  /** 右側のアクションエリア（ボタン等） */
  actions?: React.ReactNode;
  /** スタイルバリアント */
  variant?: 'default' | 'compact';
  /** セマンティック要素の選択 */
  as?: 'header' | 'div';
}

const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  (
    {
      icon: Icon,
      title,
      description,
      count,
      actions,
      variant = 'default',
      as: Component = 'header',
      className,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref as React.Ref<never>}
        className={cn(
          'rounded-lg shadow-sm transition-colors',
          // 全体のborderをTTトークンで指定
          'border border-(--tt-color-border)',
          // 左アクセント色（primary color）
          'border-l-primary border-l-4',
          'bg-(--tt-color-surface)',
          variant === 'default' && 'min-h-[4.5rem] p-4 sm:p-6',
          variant === 'compact' && 'min-h-[3.5rem] p-3',
          className
        )}
        {...props}
      >
        <div
          className={cn(
            'flex items-start gap-3',
            variant === 'compact' && 'items-center gap-2'
          )}
        >
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-xl',
              'bg-primary text-primary-foreground shadow-md',
              variant === 'default' && 'h-12 w-12',
              variant === 'compact' && 'h-10 w-10'
            )}
            aria-hidden="true"
          >
            <Icon
              className={cn(
                variant === 'default' && 'h-6 w-6',
                variant === 'compact' && 'h-5 w-5'
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className={cn(
                  'font-heading text-foreground font-bold',
                  variant === 'default' && 'text-xl sm:text-2xl',
                  variant === 'compact' && 'text-lg sm:text-xl'
                )}
              >
                {title}
              </h1>
              {count && (
                <span
                  className="text-sm text-(--tt-color-text-muted)"
                  role="status"
                  aria-live="polite"
                >
                  ({count.label})
                </span>
              )}
            </div>
            {description && (
              <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </Component>
    );
  }
);

PageHeader.displayName = 'PageHeader';

export { PageHeader };
