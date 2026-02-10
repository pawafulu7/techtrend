export function SourcesOverviewSkeleton() {
  return (
    <div className="bg-background animate-pulse rounded-lg border px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <div className="h-4 w-20 rounded bg-(--tt-color-surface-muted)" />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-24 rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '50ms' }}
        />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-22 rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '100ms' }}
        />
        <div className="bg-border hidden h-4 w-px sm:block" />
        <div
          className="h-4 w-20 rounded bg-(--tt-color-surface-muted)"
          style={{ animationDelay: '150ms' }}
        />
      </div>
    </div>
  );
}
