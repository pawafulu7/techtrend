import { DigestSkeleton } from '@/app/components/digest/digest-skeleton';

export default function Loading() {
  return (
    <div className="px-4 py-3 lg:px-6">
      {/* Header skeleton */}
      <header className="flex items-center gap-3 pb-4">
        <div className="bg-muted h-5 w-5 animate-pulse rounded" />
        <div className="bg-muted h-6 w-32 animate-pulse rounded" />
      </header>

      {/* Tabs skeleton */}
      <div className="mb-6">
        <div className="bg-muted h-10 w-40 animate-pulse rounded-md" />
      </div>

      {/* Content skeleton */}
      <DigestSkeleton />
    </div>
  );
}
