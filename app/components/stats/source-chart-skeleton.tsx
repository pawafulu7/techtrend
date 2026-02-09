import { PieChart } from 'lucide-react';

export function SourceChartSkeleton() {
  const sources = [
    { width: 'w-[35%]' },
    { width: 'w-[28%]' },
    { width: 'w-[20%]' },
    { width: 'w-[15%]' },
    { width: 'w-[12%]' },
    { width: 'w-[8%]' },
  ];

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-(--tt-color-info)/50" />
        <div className="h-4 w-28 animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
      <div className="space-y-4">
        {sources.map((source, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 animate-pulse rounded-full bg-(--tt-color-surface-muted)" />
                <div className="h-4 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-(--tt-color-surface-muted)" />
            </div>
            <div className="bg-secondary h-2 overflow-hidden rounded-full">
              <div
                className={`h-full animate-pulse bg-(--tt-color-surface-muted) ${source.width}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">合計</span>
          <div className="h-5 w-16 animate-pulse rounded bg-(--tt-color-surface-muted)" />
        </div>
      </div>
    </div>
  );
}
