import { CalendarDays } from 'lucide-react';

export function ChartSkeleton() {
  const barHeights = [45, 70, 55, 80, 65, 75, 60];

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-(--tt-color-info)/50" />
        <div className="h-4 w-24 animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
      <div className="relative h-[200px]">
        <div className="absolute right-0 bottom-5 left-0 flex items-end justify-around">
          {barHeights.map((height, i) => (
            <div
              key={i}
              className="w-8 animate-pulse rounded-t bg-(--tt-color-surface-muted)"
              style={{
                height: `${height * 2}px`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
