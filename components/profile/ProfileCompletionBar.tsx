'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProfileCompletionBarProps {
  percentage: number;
  message: string;
  isLowCompletion: boolean;
  incompleteFields: string[];
  className?: string;
}

/**
 * Profile completion progress bar component
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
}: ProfileCompletionBarProps) {
  return (
    <div
      className={cn(
        'w-full max-w-xs mx-auto mt-4 p-4 rounded-lg',
        isLowCompletion && 'bg-muted/50',
        className
      )}
    >
      {/* Header with percentage and message */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          Profile {percentage}%
        </span>
        <span
          className={cn(
            'text-xs font-medium',
            percentage >= 80
              ? 'text-[var(--tt-color-primary)]'
              : 'text-muted-foreground'
          )}
        >
          {message}
        </span>
      </div>

      {/* Progress bar with aria attributes */}
      <Progress
        value={percentage}
        className="h-2"
        aria-label={`Profile completion: ${percentage}%`}
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      />

      {/* Incomplete fields hint for low completion */}
      {isLowCompletion && incompleteFields.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Add: {incompleteFields.slice(0, 3).join(', ')}
          {incompleteFields.length > 3 && ` +${incompleteFields.length - 3} more`}
        </p>
      )}
    </div>
  );
}
