import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

export type BadgeV2Variant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'positive'
  | 'info'
  | 'destructive';

export interface BadgeV2Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeV2Variant;
  disabled?: boolean;
  asChild?: boolean;
}

const BadgeV2 = forwardRef<HTMLSpanElement, BadgeV2Props>(
  (
    {
      variant = 'default',
      disabled = false,
      asChild = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'span';

    return (
      <Comp
        ref={ref}
        className={cn(
          'badge-pill',
          'transition-colors duration-150',
          variant === 'default' && [
            'bg-(--tt-color-surface-hover) text-(--tt-color-text-muted)',
          ],
          variant === 'primary' && [
            'bg-(--tt-color-primary) text-(--tt-color-on-primary)',
            'hover:bg-(--tt-color-primary-hover)',
          ],
          variant === 'secondary' && [
            'bg-(--tt-color-secondary) text-white',
            'hover:bg-(--tt-color-secondary-hover)',
          ],
          variant === 'outline' && [
            'border border-(--tt-color-border)',
            'bg-transparent text-(--tt-color-text)',
            'hover:border-(--tt-color-border-hover) hover:bg-(--tt-color-surface-hover)',
          ],
          variant === 'positive' && [
            'bg-[var(--tt-color-positive-bg)] text-[var(--tt-color-positive)]',
            'border border-[var(--tt-color-positive-border)]',
          ],
          variant === 'info' && [
            'bg-[var(--tt-color-info-bg)] text-[var(--tt-color-info)]',
            'border border-[var(--tt-color-info-border)]',
          ],
          variant === 'destructive' && [
            'bg-[var(--tt-color-negative-bg)] text-[var(--tt-color-negative)]',
            'border border-[var(--tt-color-negative-border)]',
          ],
          disabled && ['cursor-not-allowed opacity-50', 'pointer-events-none'],
          className
        )}
        aria-disabled={disabled}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);

BadgeV2.displayName = 'BadgeV2';

export { BadgeV2 };
