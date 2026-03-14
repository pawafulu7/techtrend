import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  message?: string;
  fullPage?: boolean;
}

export function LoadingSpinner({
  message = '読み込み中...',
  fullPage = true,
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-6',
        fullPage ? 'h-full min-h-[400px]' : 'py-12'
      )}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-2">
        <TrendingUp className="text-primary h-6 w-6" aria-hidden="true" />
        <span className="text-foreground text-base font-semibold tracking-tight">
          TechTrend
        </span>
      </div>

      {/* Progress bar with shimmer */}
      <div className="bg-primary/15 relative h-[3px] w-[280px] overflow-hidden rounded-full">
        <div className="animate-shimmer via-primary/30 absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent to-transparent motion-reduce:animate-none" />
      </div>

      {/* Context message */}
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
