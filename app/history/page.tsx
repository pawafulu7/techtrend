import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { HistoryContent } from './_components/history-content';

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/history');
  }
  return <HistoryContent />;
}
