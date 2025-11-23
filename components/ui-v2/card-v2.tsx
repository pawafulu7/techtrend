import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export interface CardV2Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover' | 'ghost';
}

const CardV2 = forwardRef<HTMLDivElement, CardV2Props>(
  ({ variant = 'default', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border transition-all duration-200',
          variant === 'default' && [
            'bg-[var(--tt-color-surface)] border-[var(--tt-color-border)]',
          ],
          variant === 'hover' && [
            'bg-[var(--tt-color-surface)] border-[var(--tt-color-border)]',
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

const CardV2Header = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  )
);
CardV2Header.displayName = 'CardV2Header';

const CardV2Title = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardV2Title.displayName = 'CardV2Title';

const CardV2Description = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
);
CardV2Description.displayName = 'CardV2Description';

const CardV2Content = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardV2Content.displayName = 'CardV2Content';

const CardV2Footer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
);
CardV2Footer.displayName = 'CardV2Footer';

export {
  CardV2,
  CardV2Header,
  CardV2Title,
  CardV2Description,
  CardV2Content,
  CardV2Footer,
};
