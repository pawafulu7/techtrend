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
  error?: boolean;
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
  error,
}: SummaryCardsSectionProps) {
  // Show loading skeleton only during initial load (no data yet)
  if (loading && !processingLogs && !embeddingSummary && !articleStats) {
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

  // Show error state only if all data is missing and there's an error
  if (error && !processingLogs && !embeddingSummary && !articleStats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="min-h-[120px] bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-center text-muted-foreground text-sm"
          >
            Failed to load
          </div>
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
          processingLogs?.summary?.successRate?.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${processingLogs?.summary?.successCount ?? 0} / ${processingLogs?.summary?.total ?? 0} processes succeeded`}
        status={
          processingLogs?.summary
            ? getSuccessRateStatus(processingLogs.summary.successRate)
            : undefined
        }
      />

      {/* Embedding Completion Rate */}
      <MetricsCard
        title="Embedding Completion"
        value={
          embeddingSummary?.completionRate?.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${embeddingSummary?.statusCounts?.COMPLETED?.toLocaleString() ?? 0} completed jobs`}
        status={
          embeddingSummary?.completionRate !== undefined
            ? getCompletionRateStatus(embeddingSummary.completionRate)
            : undefined
        }
      />

      {/* Pending + Processing Jobs */}
      <MetricsCard
        title="Jobs in Queue"
        value={
          embeddingSummary?.statusCounts
            ? (
                (embeddingSummary.statusCounts.PENDING ?? 0) +
                (embeddingSummary.statusCounts.PROCESSING ?? 0)
              ).toLocaleString()
            : '-'
        }
        description={`${embeddingSummary?.statusCounts?.PENDING ?? 0} pending, ${embeddingSummary?.statusCounts?.PROCESSING ?? 0} processing`}
        status={
          embeddingSummary?.statusCounts
            ? getPendingStatus(
                (embeddingSummary.statusCounts.PENDING ?? 0) +
                  (embeddingSummary.statusCounts.PROCESSING ?? 0)
              )
            : undefined
        }
        isIncreaseGood={false}
      />

      {/* Article Summary Rate */}
      <MetricsCard
        title="Article Summary Rate"
        value={
          articleStats?.totals?.overallRate?.toFixed(1) ?? '-'
        }
        unit="%"
        description={`${articleStats?.totals?.summaries?.toLocaleString() ?? 0} / ${articleStats?.totals?.articles?.toLocaleString() ?? 0} articles have summaries`}
        status={
          articleStats?.totals?.overallRate !== undefined
            ? getSuccessRateStatus(articleStats.totals.overallRate)
            : undefined
        }
      />
    </div>
  );
}
