/**
 * API Metrics Telemetry Endpoint
 *
 * Provides unified access to API performance metrics including:
 * - Response time percentiles (p50, p75, p90, p95, p99)
 * - Cache hit rates
 * - Database query statistics
 * - Batch processing metrics
 */
import { NextResponse } from 'next/server';
import {
  recommendationMetrics,
  type PercentileStats,
} from '@/lib/monitoring/recommendation-metrics';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';

/**
 * GET /api/telemetry/metrics
 *
 * Returns aggregated API metrics for monitoring and alerting
 */
async function getHandler(): Promise<NextResponse> {
  const summary = recommendationMetrics.getSummary();
  const responseTimePercentiles =
    recommendationMetrics.getAllResponseTimePercentiles();
  const batchSizePercentiles = recommendationMetrics.getBatchSizePercentiles();

  const response: ApiMetricsResponse = {
    timestamp: new Date().toISOString(),
    uptime: summary.uptime,
    cache: {
      hits: summary.cache.hits,
      misses: summary.cache.misses,
      hitRate: parseFloat(summary.cache.hitRate.replace('%', '')) || 0,
    },
    database: {
      totalQueries: summary.database.totalQueries,
      avgQueriesPerRequest:
        parseFloat(summary.database.avgQueriesPerRequest) || 0,
    },
    responseTime: responseTimePercentiles,
    batchSize: batchSizePercentiles,
    counters: summary.counters,
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

/**
 * Response type for API metrics endpoint
 */
interface ApiMetricsResponse {
  timestamp: string;
  uptime: string;
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  database: {
    totalQueries: number;
    avgQueriesPerRequest: number;
  };
  responseTime: Record<string, PercentileStats>;
  batchSize: PercentileStats | null;
  counters: Record<string, number>;
}

// 内部の監視値なので、管理者だけに見せる（Issue #771。以前は誰でも見られた）
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
