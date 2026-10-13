import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { listAllValues } from '@/lib/utils/list-all-values';
import type {
  MetricName,
  MetricRating,
  NavigationType,
} from '@/lib/telemetry/web-vitals-types';

const logger = createLogger('telemetry:vitals');

// web-vitals が送る値のすべて。web-vitals の更新で値が増えたら、ここに足さないと
// コンパイルが止まる（足し忘れると、その値の計測を 400 で捨ててしまう）
const METRIC_NAMES = listAllValues<MetricName>()([
  'LCP',
  'INP',
  'CLS',
  'FCP',
  'TTFB',
]);
const METRIC_RATINGS = listAllValues<MetricRating>()([
  'good',
  'needs-improvement',
  'poor',
]);
const NAVIGATION_TYPES = listAllValues<NavigationType>()([
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
  'soft-navigation',
]);

/**
 * Validation schema for Web Vitals payload
 */
const webVitalsSchema = z.object({
  name: z.enum(METRIC_NAMES),
  value: z.number(),
  delta: z.number(),
  id: z.string(),
  rating: z.enum(METRIC_RATINGS),
  navigationType: z.enum(NAVIGATION_TYPES),
  page: z.string(),
  timestamp: z.number(),
});

/**
 * In-memory storage for Web Vitals metrics
 * In production, this would be sent to a time-series database or analytics service
 */
const metricsBuffer: Array<z.infer<typeof webVitalsSchema>> = [];
const MAX_BUFFER_SIZE = 1000;

/**
 * POST /api/telemetry/vitals
 *
 * Receives Web Vitals metrics from client-side reporter
 * Stores in buffer for aggregation and analysis
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // JSON として読めない本文は、形の合わない本文と同じく 400 にする（500 にしない）
    const body: unknown = await request.json().catch(() => undefined);
    const parsed = webVitalsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const metric = parsed.data;

    // Log metric for analysis (structured logging)
    logger.info({
      type: 'web_vital',
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      page: metric.page,
      navigationType: metric.navigationType,
    });

    // Store in buffer (rotating buffer)
    if (metricsBuffer.length >= MAX_BUFFER_SIZE) {
      metricsBuffer.shift();
    }
    metricsBuffer.push(metric);

    // Return 204 No Content for successful telemetry
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ err: error }, 'Failed to process Web Vitals metric');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telemetry/vitals
 *
 * Returns aggregated Web Vitals metrics for monitoring
 * Requires admin authentication in production
 *
 * TODO(auth): Add admin authentication/authorization guard before returning vitals
 * Consider: getServerSession check, internal network restriction, or API key validation
 */
export async function GET(): Promise<NextResponse> {
  // TODO(auth): Enable authentication check in production
  // const session = await getServerSession();
  // if (!session?.user?.isAdmin) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  // Aggregate metrics by page and metric name
  const aggregated: Record<
    string,
    Record<string, { values: number[]; ratings: Record<string, number> }>
  > = {};

  for (const metric of metricsBuffer) {
    if (!aggregated[metric.page]) {
      aggregated[metric.page] = {};
    }
    if (!aggregated[metric.page][metric.name]) {
      aggregated[metric.page][metric.name] = {
        values: [],
        ratings: { good: 0, 'needs-improvement': 0, poor: 0 },
      };
    }

    aggregated[metric.page][metric.name].values.push(metric.value);
    aggregated[metric.page][metric.name].ratings[metric.rating]++;
  }

  // Calculate percentiles
  const result: Record<
    string,
    Record<
      string,
      { p50: number; p75: number; p95: number; ratings: Record<string, number> }
    >
  > = {};

  for (const [page, metrics] of Object.entries(aggregated)) {
    result[page] = {};
    for (const [name, data] of Object.entries(metrics)) {
      const sorted = [...data.values].sort((a, b) => a - b);
      const len = sorted.length;

      result[page][name] = {
        p50: sorted[Math.floor(len * 0.5)] ?? 0,
        p75: sorted[Math.floor(len * 0.75)] ?? 0,
        p95: sorted[Math.floor(len * 0.95)] ?? 0,
        ratings: data.ratings,
      };
    }
  }

  return NextResponse.json({
    bufferSize: metricsBuffer.length,
    maxBufferSize: MAX_BUFFER_SIZE,
    pages: result,
  });
}
