import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import { getSession } from '@/lib/auth/get-session';
import { features } from '@/config/features';
import { AgentSearchClient } from './_components/agent-search-client';

export default async function AgentSearchPage() {
  if (!features.aiSearch) {
    redirect('/');
  }

  const session = await getSession();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/search/agent');
  }

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      <div className="container mx-auto px-6 py-6">
        {/* 作業型の画面なのでレイアウトは変えず、見出し行だけ他の画面とそろえる（Issue #700） */}
        <PageHeader icon={Sparkles} title="AI検索" />
        <AgentSearchClient />
      </div>
    </div>
  );
}
