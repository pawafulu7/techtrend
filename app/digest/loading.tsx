import { DigestSkeleton } from '@/app/components/digest/digest-skeleton';

export default function Loading() {
  return (
    <div className="px-4 py-3 lg:px-6">
      <DigestSkeleton />
    </div>
  );
}
