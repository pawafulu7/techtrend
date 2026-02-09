import { Tag } from 'lucide-react';

export function TagCloudSkeleton() {
  const tagWidths = [
    'w-20',
    'w-24',
    'w-16',
    'w-28',
    'w-32',
    'w-24',
    'w-20',
    'w-36',
    'w-16',
    'w-24',
    'w-28',
    'w-20',
  ];

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4 text-(--tt-color-info)/50" />
        <div className="h-4 w-20 animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
      <div className="flex flex-wrap gap-2">
        {tagWidths.map((width, i) => (
          <div
            key={i}
            className={`h-7 ${width} animate-pulse rounded-full bg-(--tt-color-surface-muted)`}
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
