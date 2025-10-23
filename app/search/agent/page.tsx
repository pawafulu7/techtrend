import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { features } from '@/config/features';
import { AgentSearchClient } from './_components/agent-search-client';

export default async function AgentSearchPage() {
  if (!features.aiSearch) {
    redirect('/');
  }

  const session = await auth();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/search/agent');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <AgentSearchClient />
    </div>
  );
}
