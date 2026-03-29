import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export interface CardV2Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'ghost';
}

const CardV2 = forwardRef<HTMLDivElement, CardV2Props>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    return (
      <div
        data-slot="card"
        ref={ref}
        className={cn(
          'flex flex-col rounded-lg border transition-all duration-200',
          variant === 'default' && [
            'border-(--tt-color-border) bg-(--tt-color-surface)',
          ],
          variant === 'hover' && [
            'border-(--tt-color-border) bg-(--tt-color-surface)',
            'card-hover',
          ],
          variant === 'ghost' && 'border-none shadow-none',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardV2.displayName = 'CardV2';

const CardV2Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    data-slot="card-header"
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardV2Header.displayName = 'CardV2Header';

const CardV2Title = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    data-slot="card-title"
    ref={ref}
    className={cn(
      'text-2xl leading-none font-semibold tracking-tight',
      className
    )}
    {...props}
  />
));
CardV2Title.displayName = 'CardV2Title';

const CardV2Description = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    data-slot="card-description"
    ref={ref}
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
));
CardV2Description.displayName = 'CardV2Description';

const CardV2Content = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    data-slot="card-content"
    ref={ref}
    className={cn('p-6 pt-0', className)}
    {...props}
  />
));
CardV2Content.displayName = 'CardV2Content';

const CardV2Footer = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    data-slot="card-footer"
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardV2Footer.displayName = 'CardV2Footer';

export {
  CardV2,
  CardV2Header,
  CardV2Title,
  CardV2Description,
  CardV2Content,
  CardV2Footer,
};

// v1 name re-exports for import path migration (PR6)
// Note: v2 API differs from v1 — no CardAction, no asChild on CardTitle
// data-slot attributes are kept for migration-time CSS compatibility
export {
  CardV2 as Card,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  CardV2Description as CardDescription,
  CardV2Content as CardContent,
  CardV2Footer as CardFooter,
};
