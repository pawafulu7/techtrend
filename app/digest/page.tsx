'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DigestClient } from '@/app/components/digest/digest-client';

export default function DigestPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/login?callbackUrl=/digest');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="px-4 py-3 lg:px-6">
        {/* Loading skeleton */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-muted h-6 w-6 animate-pulse rounded" />
            <div className="bg-muted h-7 w-40 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-10 w-60 animate-pulse rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="bg-muted h-6 w-48 animate-pulse rounded" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="bg-muted h-32 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return <DigestClient />;
}
