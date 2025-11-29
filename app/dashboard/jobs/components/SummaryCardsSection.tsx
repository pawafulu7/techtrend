'use client';

import { MetricsCard } from '@/components/dashboard/MetricsCard';
import type {
  ProcessingLogsResponse,
  EmbeddingSummaryResponse,
  ArticleStatsResponse,
} from '../types';

interface SummaryCardsSectionProps {
  processingLogs: ProcessingLogsResponse | null;
  embeddingSummary: EmbeddingSummaryResponse | null;
  articleStats: ArticleStatsResponse | null;
  loading?: boolean;
}

/**
 * Get status based on success rate
 */
function getSuccessRateStatus(
  rate: number
): 'good' | 'warning' | 'critical' | undefined {
  if (rate >= 90) return 'good';
  if (rate >= 70) return 'warning';
  return 'critical';
}

/**
 * Get status based on completion rate
 */
function getCompletionRateStatus(
  rate: number
): 'good' | 'warning' | 'critical' | undefined {
  if (rate >= 95) return 'good';
  if (rate >= 80) return 'warning';
  return 'critical';
}

/**
 * Get status based on pending/processing count
 */
function getPendingStatus(
  count: number
): 'good' | 'warning' | 'critical' | undefined {
  if (count < 10) return 'good';
  if (count < 50) return 'warning';
  return 'critical';
}

/**
 * Summary Cards Section - Overview metrics at a glance
 */
export function SummaryCardsSection({
  processingLogs,
  embeddingSummary,
  articleStats,
  loading,
}: SummaryCardsSectionProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="min-h-[120px] bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Processing Logs Success Rate */}
      <MetricsCard
        title="Process Success Rate"
        value={
          processingLogs?.summary.successRate.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${processingLogs?.summary.successCount ?? 0} / ${processingLogs?.summary.total ?? 0} processes succeeded`}
        status={
          processingLogs
            ? getSuccessRateStatus(processingLogs.summary.successRate)
            : undefined
        }
      />

      {/* Embedding Completion Rate */}
      <MetricsCard
        title="Embedding Completion"
        value={
          embeddingSummary?.completionRate.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${embeddingSummary?.statusCounts.COMPLETED.toLocaleString() ?? 0} completed jobs`}
        status={
          embeddingSummary
            ? getCompletionRateStatus(embeddingSummary.completionRate)
            : undefined
        }
      />

      {/* Pending + Processing Jobs */}
      <MetricsCard
        title="Jobs in Queue"
        value={
          embeddingSummary
            ? (
                embeddingSummary.statusCounts.PENDING +
                embeddingSummary.statusCounts.PROCESSING
              ).toLocaleString()
            : '-'
        }
        description={`${embeddingSummary?.statusCounts.PENDING ?? 0} pending, ${embeddingSummary?.statusCounts.PROCESSING ?? 0} processing`}
        status={
          embeddingSummary
            ? getPendingStatus(
                embeddingSummary.statusCounts.PENDING +
                  embeddingSummary.statusCounts.PROCESSING
              )
            : undefined
        }
        isIncreaseGood={false}
      />

      {/* Article Summary Rate */}
      <MetricsCard
        title="Article Summary Rate"
        value={
          articleStats?.totals.overallRate.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${articleStats?.totals.summaries.toLocaleString() ?? 0} / ${articleStats?.totals.articles.toLocaleString() ?? 0} articles have summaries`}
        status={
          articleStats
            ? getSuccessRateStatus(articleStats.totals.overallRate)
            : undefined
        }
      />
    </div>
  );
}
