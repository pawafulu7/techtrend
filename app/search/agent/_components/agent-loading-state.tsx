'use client';

const DOT_ANIMATION_DELAYS = [0, 150, 300];

interface AgentLoadingStateProps {
  className?: string;
}

export function AgentLoadingState({ className }: AgentLoadingStateProps) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DOT_ANIMATION_DELAYS.map((delay) => (
              <span
                key={delay}
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
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '85%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '70%' }} />
        <div className="h-4 bg-muted rounded animate-pulse mt-6" style={{ width: '40%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '95%' }} />
        <div className="h-4 bg-muted rounded animate-pulse" style={{ width: '80%' }} />
      </div>
    </div>
  );
}
