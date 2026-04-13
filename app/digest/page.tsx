import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { DigestClient } from '@/app/components/digest/digest-client';

export default async function DigestPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/digest');
  }

  return <DigestClient />;
}
