import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { Loader2 } from 'lucide-react';

const PRIMARY_STYLE =
  'bg-(--tt-color-primary) text-(--tt-color-on-primary) hover:bg-(--tt-color-primary-hover) shadow-sm hover:shadow-md';
const DEFAULT_SIZE = 'h-9 px-4 py-2 text-sm has-[>svg]:px-3';

const buttonV2Variants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-(--tt-color-primary)',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        // v1 "default" = primary-colored button (alias kept for v1 compat)
        default: PRIMARY_STYLE,
        primary: PRIMARY_STYLE,
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
        default: DEFAULT_SIZE,
        xs: 'h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*="size-"])]:size-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        md: DEFAULT_SIZE, // alias for v2 consumers
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

type SizeKey = NonNullable<ButtonV2VariantProps['size']>;

const ICON_SIZE_MAP: Record<SizeKey, ButtonV2VariantProps['size']> = {
  default: 'icon',
  xs: 'icon-xs',
  sm: 'icon-sm',
  md: 'icon',
  lg: 'icon-lg',
  icon: 'icon',
  'icon-xs': 'icon-xs',
  'icon-sm': 'icon-sm',
  'icon-lg': 'icon-lg',
};

const SPINNER_SIZE: Partial<Record<SizeKey, string>> = {
  xs: 'size-3',
  sm: 'size-3',
  'icon-xs': 'size-3',
  'icon-sm': 'size-3',
  lg: 'size-5',
  'icon-lg': 'size-5',
};

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
  onClick,
  ...props
}: ButtonV2Props) {
  const isDisabled = disabled || loading;
  const Comp = asChild ? Slot.Root : 'button';
  const resolvedSize = iconOnly
    ? (ICON_SIZE_MAP[size ?? 'default'] ?? 'icon')
    : size;

  const disabledProps = asChild
    ? {
        'aria-disabled': isDisabled || undefined,
        tabIndex: isDisabled ? -1 : undefined,
        onClick: isDisabled
          ? (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
            }
          : onClick,
      }
    : { disabled: isDisabled, onClick };

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      type={asChild ? undefined : type}
      className={buttonV2Variants({ variant, size: resolvedSize, className })}
      {...props}
      {...disabledProps}
    >
      {/* asChild uses Slot.Root which requires a single child element */}
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <Loader2
              className={`animate-spin ${SPINNER_SIZE[resolvedSize ?? 'default'] ?? 'size-4'}`}
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
