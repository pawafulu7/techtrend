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

/**
 * GET /api/telemetry/metrics
 *
 * Returns aggregated API metrics for monitoring and alerting
 */
export async function GET(): Promise<NextResponse> {
  const summary = recommendationMetrics.getSummary();
  const responseTimePercentiles = recommendationMetrics.getAllResponseTimePercentiles();
  const batchSizePercentiles = recommendationMetrics.getBatchSizePercentiles();

  const response: ApiMetricsResponse = {
    timestamp: new Date().toISOString(),
    uptime: summary.uptime,
    cache: {
      hits: summary.cache.hits,
      misses: summary.cache.misses,
      hitRate: parseFloat(summary.cache.hitRate.replace('%', '')),
    },
    database: {
      totalQueries: summary.database.totalQueries,
      avgQueriesPerRequest: parseFloat(summary.database.avgQueriesPerRequest),
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
