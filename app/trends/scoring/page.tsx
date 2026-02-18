import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import ScoringPageClient from './page-client';
import type { TrendScoreResult } from '@/lib/types/trend-types';
import { prisma } from '@/lib/prisma';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';

export const revalidate = 300;

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
    const service = new TrendScoringService(prisma);
    const result = await service.getLatestScores({ limit: 100, sort: 'score' });
    const lastUpdatedAt =
      result.scores.length > 0
        ? result.scores.reduce(
            (latest, score) =>
              score.calculatedAt > latest ? score.calculatedAt : latest,
            result.scores[0].calculatedAt
          )
        : null;
    return { scores: result.scores, total: result.total, lastUpdatedAt };
  } catch (error) {
    console.error('[ScoringPage] Failed to fetch initial scores:', error);
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
        count={total > 0 ? { value: total, label: 'entities' } : undefined}
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
