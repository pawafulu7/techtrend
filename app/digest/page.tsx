import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { DigestClient } from '@/app/components/digest/digest-client';

export default async function DigestPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/digest');
  }

  return <DigestClient />;
}
