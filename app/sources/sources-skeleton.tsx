import { Skeleton } from '@/components/ui/skeleton';
import { SourcesOverviewSkeleton } from '@/app/components/sources/SourcesOverviewSkeleton';

export function SourcesSkeleton() {
  return (
    <div className="space-y-6">
      {/* 統計バー */}
      <SourcesOverviewSkeleton />

      {/* 検索・ソート ツールバー */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 min-w-0 flex-1" />
        <Skeleton className="h-10 w-[160px]" />
        <Skeleton className="h-10 w-10" />
      </div>

      {/* タブ */}
      <Skeleton className="h-10 w-full max-w-3xl" />

      {/* グリッド */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-64 rounded-lg"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
