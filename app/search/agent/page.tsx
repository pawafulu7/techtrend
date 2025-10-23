import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { features } from '@/config/features';

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
      <h1 className="text-3xl font-bold mb-6">AI Article Search</h1>
      <p className="text-muted-foreground">Phase 1: Page shell created</p>
      <p className="text-sm text-muted-foreground mt-2">
        Feature flag enabled. Authentication verified.
      </p>
    </div>
  );
}
