'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, TrendingUp } from 'lucide-react';

interface ProfileCompletionBarProps {
  percentage: number;
  message: string;
  isLowCompletion: boolean;
  incompleteFields: string[];
  className?: string;
  /** Visual variant: light (default) or dark (for dark backgrounds) */
  variant?: 'light' | 'dark';
}

/**
 * Profile completion progress bar component - Modern glass design
 * Implements Goal Gradient Effect - users are more motivated as they approach their goal
 *
 * Accessibility:
 * - aria-valuenow/min/max for screen readers
 * - aria-label with completion message
 * - Visual feedback through color gradients
 */
export function ProfileCompletionBar({
  percentage,
  message,
  isLowCompletion,
  incompleteFields,
  className,
  variant = 'light',
}: ProfileCompletionBarProps) {
  const isDark = variant === 'dark';
  const isComplete = percentage >= 100;

  return (
    <div
      className={cn(
        'w-full rounded-xl p-4',
        isDark
          ? 'border border-white/10 bg-white/5 backdrop-blur-sm'
          : 'bg-muted/30 border-border/50 border',
        className
      )}
    >
      {/* Header with percentage and message */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2
              className={cn(
                'h-4 w-4',
                isDark ? 'text-emerald-400' : 'text-emerald-500'
              )}
            />
          ) : (
            <TrendingUp
              className={cn(
                'h-4 w-4',
                isDark ? 'text-cyan-400' : 'text-cyan-600'
              )}
            />
          )}
          <span
            className={cn(
              'text-sm font-semibold',
              isDark ? 'text-white' : 'text-foreground'
            )}
          >
            {percentage}%
          </span>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            isComplete
              ? isDark
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-emerald-100 text-emerald-700'
              : isDark
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-cyan-100 text-cyan-700'
          )}
        >
          {message}
        </span>
      </div>

      {/* Progress bar with gradient */}
      <div
        className={cn(
          'relative h-2 overflow-hidden rounded-full',
          isDark ? 'bg-white/10' : 'bg-slate-200'
        )}
        role="progressbar"
        aria-label={`Profile completion: ${percentage}%`}
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out',
            isComplete
              ? 'bg-[var(--tt-color-positive)]'
              : 'bg-[var(--tt-color-info)]'
          )}
          style={{ width: `${percentage}%` }}
        />
        {/* Shimmer effect */}
        {!isComplete && percentage > 0 && (
          <div
            className="animate-shimmer absolute inset-y-0 left-0 bg-white/30"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>

      {/* Incomplete fields hint for low completion */}
      {isLowCompletion && incompleteFields.length > 0 && (
        <p
          className={cn(
            'mt-3 text-xs',
            isDark ? 'text-slate-400' : 'text-muted-foreground'
          )}
        >
          <span
            className={cn(
              'font-medium',
              isDark ? 'text-cyan-400' : 'text-cyan-600'
            )}
          >
            追加:
          </span>{' '}
          {incompleteFields.slice(0, 3).join(', ')}
          {incompleteFields.length > 3 && ` +${incompleteFields.length - 3}`}
        </p>
      )}
    </div>
  );
}
