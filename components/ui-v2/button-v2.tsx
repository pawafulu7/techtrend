import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonV2Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconOnly?: boolean;
  asChild?: boolean;
}

const ButtonV2 = forwardRef<HTMLButtonElement, ButtonV2Props>(
  (
    {
      variant = 'default',
      size = 'md',
      loading = false,
      iconOnly = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'focus-visible:ring-[var(--tt-color-primary)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',

          // Variants
          variant === 'default' && [
            'bg-white dark:bg-gray-800',
            'text-gray-900 dark:text-gray-100',
            'border border-gray-300 dark:border-gray-600',
            'hover:bg-gray-50 dark:hover:bg-gray-700',
          ],
          variant === 'primary' && [
            'bg-[var(--tt-color-primary)] text-[var(--tt-color-on-primary)]',
            'hover:bg-[var(--tt-color-primary-hover)]',
            'shadow-sm hover:shadow-md',
          ],
          variant === 'secondary' && [
            'bg-[var(--tt-color-secondary)] text-white',
            'hover:bg-[var(--tt-color-secondary-hover)]',
            'shadow-sm hover:shadow-md',
          ],
          variant === 'ghost' && [
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'text-gray-700 dark:text-gray-300',
          ],
          variant === 'outline' && [
            'border border-gray-300 dark:border-gray-600',
            'bg-transparent',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'text-gray-700 dark:text-gray-300',
          ],

          // Sizes
          size === 'sm' && (iconOnly ? 'p-2' : 'px-3 py-1.5 text-sm'),
          size === 'md' && (iconOnly ? 'p-2.5' : 'px-4 py-2 text-base'),
          size === 'lg' && (iconOnly ? 'p-3' : 'px-6 py-3 text-lg'),

          // Border radius
          'rounded-md',

          className
        )}
        {...props}
      >
        {loading && (
          <Loader2
            className={cn(
              'animate-spin',
              !iconOnly && 'mr-2',
              size === 'sm' && 'h-3 w-3',
              size === 'md' && 'h-4 w-4',
              size === 'lg' && 'h-5 w-5'
            )}
          />
        )}
        {children}
      </button>
    );
  }
);

ButtonV2.displayName = 'ButtonV2';

export { ButtonV2 };
