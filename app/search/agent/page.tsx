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
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="container mx-auto px-6 py-6">
        <AgentSearchClient />
      </div>
    </div>
  );
}
