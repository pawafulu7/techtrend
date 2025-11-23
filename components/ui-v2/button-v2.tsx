import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonV2Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconOnly?: boolean;
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
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'focus-visible:ring-(--tt-color-primary)',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',

          // Variants
          variant === 'default' && [
            'bg-(--tt-color-surface) text-(--tt-color-text)',
            'border border-(--tt-color-border)',
            'hover:bg-(--tt-color-surface-hover) hover:border-(--tt-color-border-hover)',
          ],
          variant === 'primary' && [
            'bg-(--tt-color-primary) text-(--tt-color-on-primary)',
            'hover:bg-(--tt-color-primary-hover)',
            'shadow-sm hover:shadow-md',
          ],
          variant === 'secondary' && [
            'bg-(--tt-color-secondary) text-white',
            'hover:bg-(--tt-color-secondary-hover)',
            'shadow-sm hover:shadow-md',
          ],
          variant === 'ghost' && [
            'hover:bg-(--tt-color-surface-hover)',
            'text-(--tt-color-text)',
          ],
          variant === 'outline' && [
            'border border-(--tt-color-border)',
            'bg-transparent',
            'hover:bg-(--tt-color-surface-hover) hover:border-(--tt-color-border-hover)',
            'text-(--tt-color-text)',
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
