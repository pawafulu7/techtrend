'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DigestClient } from '@/app/components/digest/digest-client';
import { DigestSkeleton } from '@/app/components/digest/digest-skeleton';

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
        <DigestSkeleton />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return <DigestClient />;
}
