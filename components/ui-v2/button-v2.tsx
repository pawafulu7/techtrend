import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonV2Variants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-(--tt-color-primary)',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-(--tt-color-primary) text-(--tt-color-on-primary) hover:bg-(--tt-color-primary-hover) shadow-sm hover:shadow-md',
        primary:
          'bg-(--tt-color-primary) text-(--tt-color-on-primary) hover:bg-(--tt-color-primary-hover) shadow-sm hover:shadow-md',
        secondary:
          'bg-(--tt-color-secondary) text-white hover:bg-(--tt-color-secondary-hover) shadow-sm hover:shadow-md',
        ghost: 'hover:bg-(--tt-color-surface-hover) text-(--tt-color-text)',
        outline:
          'border border-(--tt-color-border) bg-transparent hover:bg-(--tt-color-surface-hover) hover:border-(--tt-color-border-hover) text-(--tt-color-text)',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        link: 'text-(--tt-color-primary) underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm has-[>svg]:px-3',
        xs: 'h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*="size-"])]:size-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        md: 'h-9 px-4 py-2 text-sm has-[>svg]:px-3',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': 'size-6 [&_svg:not([class*="size-"])]:size-3',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonV2VariantProps = VariantProps<typeof buttonV2Variants>;

interface ButtonV2Props
  extends React.ComponentProps<'button'>, ButtonV2VariantProps {
  asChild?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
}

function ButtonV2({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  iconOnly = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonV2Props) {
  const isDisabled = disabled || loading;
  const Comp = asChild ? Slot.Root : 'button';

  // iconOnly: override size to fixed-dimension icon size
  const resolvedSize = iconOnly
    ? size === 'sm'
      ? 'icon-sm'
      : size === 'lg'
        ? 'icon-lg'
        : 'icon'
    : size;

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : type}
      disabled={isDisabled}
      className={cn(
        buttonV2Variants({ variant, size: resolvedSize, className })
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <Loader2
              className={cn(
                'animate-spin',
                resolvedSize === 'sm' || resolvedSize === 'icon-sm'
                  ? 'h-3 w-3'
                  : resolvedSize === 'lg' || resolvedSize === 'icon-lg'
                    ? 'h-5 w-5'
                    : 'h-4 w-4'
              )}
            />
          )}
          {children}
        </>
      )}
    </Comp>
  );
}

ButtonV2.displayName = 'ButtonV2';

// v1-compatible re-exports for gradual migration
const Button = ButtonV2;
const buttonVariants = buttonV2Variants;

export { ButtonV2, buttonV2Variants, Button, buttonVariants };
export type { ButtonV2Props };
