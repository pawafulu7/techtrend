export function SourcesOverviewSkeleton() {
  return (
    <div className="bg-background rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <div className="h-4 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)" />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-24 animate-pulse rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '50ms' }}
        />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '100ms' }}
        />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '150ms' }}
        />
      </div>
    </div>
  );
}
