import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export interface BadgeV2Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
}

const BadgeV2 = forwardRef<HTMLSpanElement, BadgeV2Props>(
  ({ variant = 'default', disabled = false, className, children, ...props }, ref) => {
    return (
      <span
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
            'hover:bg-(--tt-color-surface-hover)',
          ],
          disabled && [
            'opacity-50 cursor-not-allowed',
            'pointer-events-none',
          ],
          className
        )}
        aria-disabled={disabled}
        {...props}
      >
        {children}
      </span>
    );
  }
);

BadgeV2.displayName = 'BadgeV2';

export { BadgeV2 };
