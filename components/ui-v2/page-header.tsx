import type React from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** アイコンコンポーネント（lucide-react等） */
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** ページタイトル（h1として表示） */
  title: string;
  /** 説明文（オプション） */
  description?: React.ReactNode;
  /** 件数表示（オプション、aria-live対応） */
  count?: { value: number; label: string };
  /** 右側のアクションエリア（ボタン等） */
  actions?: React.ReactNode;
  /** 下の余白の大きさ。compact は一覧のツールバーの直前など、詰めたいときに使う */
  variant?: 'default' | 'compact';
  /** セマンティック要素の選択 */
  as?: 'header' | 'div';
}

/**
 * ページの見出し行（h1）。一覧型・分析型の画面で使う（Issue #700）。
 * 枠や塗りのアイコン箱は付けず、アイコン・h1・件数・アクションを1行に並べる。
 * 縦の領域を食わないことと、画面ごとに h1 の大きさがばらつかないことを優先している。
 */
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
        data-slot="page-header"
        className={cn(
          'flex flex-wrap items-start gap-x-4 gap-y-2',
          variant === 'default' && 'pb-4',
          variant === 'compact' && 'pb-2',
          className
        )}
        {...props}
      >
        {/* basis を auto（内容の幅）にする。flex-1（basis 0）だと折り返しの判定で見出しの幅が 0 と
            みなされ、狭い画面でアクションが同じ行に残って見出しを1文字ずつに押しつぶす */}
        <div className="min-w-0 flex-auto">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-primary flex shrink-0" aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <h1 className="font-heading text-foreground text-h1">{title}</h1>
            {count && (
              <span
                className="text-sm text-(--tt-color-text-muted)"
                role="status"
                aria-live="polite"
              >
                {/* 件数が変わったときの読み上げに見出し名を含める（role=status は aria-atomic） */}
                <span className="sr-only">{title} </span>({count.label})
              </span>
            )}
          </div>
          {/* && だと 0 を渡されたときに 0 が描画されるので三項演算子にする */}
          {description ? (
            <div className="text-muted-foreground mt-0.5 text-sm">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </Component>
    );
  }
);

PageHeader.displayName = 'PageHeader';

export { PageHeader };
