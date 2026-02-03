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

export interface BadgeV2Props extends React.HTMLAttributes<HTMLElement> {
  variant?: BadgeV2Variant;
  disabled?: boolean;
  asChild?: boolean;
}

const BadgeV2 = forwardRef<HTMLElement, BadgeV2Props>(
  (
    {
      variant = 'default',
      disabled = false,
      asChild = false,
      className,
      children,
      onClick,
      tabIndex,
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
            'bg-(--tt-color-positive-bg) text-(--tt-color-positive)',
            'border border-(--tt-color-positive-border)',
          ],
          variant === 'info' && [
            'bg-(--tt-color-info-bg) text-(--tt-color-info)',
            'border border-(--tt-color-info-border)',
          ],
          variant === 'destructive' && [
            'bg-(--tt-color-negative-bg) text-(--tt-color-negative)',
            'border border-(--tt-color-negative-border)',
          ],
          disabled && ['cursor-not-allowed opacity-50', 'pointer-events-none'],
          className
        )}
        tabIndex={disabled ? -1 : tabIndex}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
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
