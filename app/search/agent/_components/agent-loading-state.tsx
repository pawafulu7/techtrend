'use client';

import { CardV2 } from '@/components/ui-v2/card-v2';
import { cn } from '@/lib/utils';

interface AgentLoadingStateProps {
  className?: string;
}

export function AgentLoadingState({ className }: AgentLoadingStateProps) {
  return (
    <CardV2
      variant="ghost"
      className={cn(
        'py-10 px-6 text-center flex flex-col items-center gap-4',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="agent-loading-state"
    >
      {/* Spinner with reduced motion support */}
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div
          className="h-14 w-14 rounded-full border-[3px] border-[var(--tt-color-border)] border-t-[var(--tt-color-primary)] animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      </div>

      {/* Status text */}
      <div className="space-y-1">
        <p className="text-base font-medium text-[var(--tt-color-text)]">
          AIが回答を生成中...
        </p>
        <p className="text-sm text-[var(--tt-color-text-muted)]">
          しばらくお待ちください
        </p>
      </div>
    </CardV2>
  );
}
