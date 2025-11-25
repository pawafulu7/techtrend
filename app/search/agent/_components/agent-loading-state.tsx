'use client';

import { CardV2 } from '@/components/ui-v2/card-v2';
import { cn } from '@/lib/utils';

const DOT_ANIMATION_DELAYS = [0, 150, 300];

interface AgentLoadingStateProps {
  className?: string;
}

export function AgentLoadingState({ className }: AgentLoadingStateProps) {
  return (
    <CardV2
      variant="ghost"
      className={cn('py-6 md:py-8 text-center', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="agent-loading-state"
    >
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DOT_ANIMATION_DELAYS.map((delay) => (
              <span
                key={delay}
                data-testid="typing-dot"
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
          <span className="ml-2 text-base font-medium text-muted-foreground">
            AIが回答を生成中...
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '90%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '75%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '60%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '40%' }} />
      </div>
    </CardV2>
  );
}
