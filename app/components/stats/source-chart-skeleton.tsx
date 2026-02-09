import { PieChart } from 'lucide-react';

export function SourceChartSkeleton() {
  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-(--tt-color-info)/50" />
        <div className="h-4 w-28 animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
      <div className="mb-3 h-3 animate-pulse rounded-full bg-(--tt-color-surface-muted)" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-2 w-2 animate-pulse rounded-full bg-(--tt-color-surface-muted)" />
            <div
              className="h-3 animate-pulse rounded bg-(--tt-color-surface-muted)"
              style={{
                width: `${60 + (i % 3) * 15}%`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
