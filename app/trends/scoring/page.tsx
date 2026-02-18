import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import ScoringPageClient from './page-client';
import type { TrendScoreResult } from '@/lib/types/trend-types';

export const metadata: Metadata = {
  title: 'Trend Scoring - TechTrend',
  description: 'Technology trend scores based on multi-source growth analysis',
};

interface ScoresApiResponse {
  scores: TrendScoreResult[];
  total: number;
  lastUpdatedAt: string | null;
}

async function getInitialScores(): Promise<ScoresApiResponse> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(
      `${baseUrl}/api/trends/scores?limit=100&sort=score`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) {
      return { scores: [], total: 0, lastUpdatedAt: null };
    }
    return await res.json();
  } catch {
    return { scores: [], total: 0, lastUpdatedAt: null };
  }
}

export default async function ScoringPage() {
  const { scores, total, lastUpdatedAt } = await getInitialScores();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        icon={Activity}
        title="Trend Scoring"
        description="Multi-source growth analysis across articles, GitHub, npm, and Stack Overflow"
        count={
          total > 0 ? { value: total, label: `${total} entities` } : undefined
        }
        variant="default"
        className="mb-6"
      />
      <ScoringPageClient
        initialScores={scores}
        total={total}
        lastUpdatedAt={lastUpdatedAt}
      />
    </div>
  );
}
