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
            'bg-[var(--tt-color-surface-hover)] text-[var(--tt-color-text-muted)]',
          ],
          variant === 'primary' && [
            'bg-[var(--tt-color-primary)] text-[var(--tt-color-on-primary)]',
            'hover:bg-[var(--tt-color-primary-hover)]',
          ],
          variant === 'secondary' && [
            'bg-[var(--tt-color-secondary)] text-white',
            'hover:bg-[var(--tt-color-secondary-hover)]',
          ],
          variant === 'outline' && [
            'border border-[var(--tt-color-border)]',
            'bg-transparent text-[var(--tt-color-text)]',
            'hover:bg-[var(--tt-color-surface-hover)]',
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
