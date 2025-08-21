import { Skeleton } from '@/components/ui/skeleton';

export function SourcesSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* 検索とフィルター */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-20" />
        </div>

        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      {/* タブ */}
      <div className="mb-6">
        <Skeleton className="h-10 w-full max-w-3xl" />
      </div>

      {/* グリッド */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}