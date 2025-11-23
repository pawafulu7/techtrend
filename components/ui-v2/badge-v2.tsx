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
            'bg-gray-100 text-gray-700',
            'dark:bg-gray-800 dark:text-gray-300',
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
            'border border-gray-300 dark:border-gray-600',
            'bg-transparent text-gray-700 dark:text-gray-300',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
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
