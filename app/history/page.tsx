import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/get-session';
import { HistoryContent } from './_components/history-content';

export default async function HistoryPage() {
  const session = await getSession();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/history');
  }
  return <HistoryContent />;
}
