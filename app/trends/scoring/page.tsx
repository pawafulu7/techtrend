import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui-v2/page-header';
import ScoringPageClient from './page-client';
import type { TrendScoreResult } from '@/lib/types/trend-types';
import { prisma } from '@/lib/prisma';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';
import logger from '@/lib/logger';
import { computeLastUpdatedAt } from '@/lib/utils/trend-helpers';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Trend Scoring - TechTrend',
  description: 'Technology trend scores based on multi-source growth analysis',
};

interface InitialScoresData {
  scores: TrendScoreResult[];
  total: number;
  lastUpdatedAt: string | null;
}

const trendScoringService = new TrendScoringService(prisma);

async function getInitialScores(): Promise<InitialScoresData> {
  try {
    const result = await trendScoringService.getLatestScores({
      limit: 100,
      sort: 'score',
    });
    const lastUpdatedAt = computeLastUpdatedAt(result.scores);
    return { scores: result.scores, total: result.total, lastUpdatedAt };
  } catch (error) {
    logger.error({ error }, '[ScoringPage] Failed to fetch initial scores');
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
