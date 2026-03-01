import { Skeleton } from '@/components/ui/skeleton';
import { DigestSkeleton } from '@/app/components/digest/digest-skeleton';

export default function Loading() {
  return (
    <div className="px-4 py-3 lg:px-6">
      <header className="flex items-center gap-3 pb-4">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-6 w-32" />
      </header>
      <div className="mb-6">
        <Skeleton className="h-10 w-40" />
      </div>
      <DigestSkeleton />
    </div>
  );
}
