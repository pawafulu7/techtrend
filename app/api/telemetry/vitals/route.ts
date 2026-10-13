import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
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

// 受け取る文字列の上限。上限が無いと、巨大な本文がバッファ（最大 1000 件）とログに残る
const MAX_ID_LENGTH = 128;
const MAX_PAGE_LENGTH = 2048;

/**
 * Validation schema for Web Vitals payload
 */
const webVitalsSchema = z.object({
  name: z.enum(METRIC_NAMES),
  value: z.number(),
  delta: z.number(),
  id: z.string().max(MAX_ID_LENGTH),
  rating: z.enum(METRIC_RATINGS),
  navigationType: z.enum(NAVIGATION_TYPES),
  // reporter はパス（/ で始まる）を送る。それ以外（__proto__ など）は受けない
  page: z.string().max(MAX_PAGE_LENGTH).startsWith('/'),
  timestamp: z.number(),
});

type WebVitalsMetric = z.infer<typeof webVitalsSchema>;

/**
 * In-memory storage for Web Vitals metrics
 * In production, this would be sent to a time-series database or analytics service
 *
 * 同じ計測（name と id）は、送り直されるたびに最新の値で置き換える。CLS・INP はタブを
 * 隠すたびに同じ id で送られるので、別のサンプルとして数えると二重に計上する。
 * Map は入れた順を保つので、置き換えた計測を末尾に回し、溢れたら最も古いものから捨てる
 */
const metricsBuffer = new Map<string, WebVitalsMetric>();
const MAX_BUFFER_SIZE = 1000;

/**
 * POST /api/telemetry/vitals
 *
 * Receives Web Vitals metrics from client-side reporter
 * Stores in buffer for aggregation and analysis
 */
async function postHandler(request: NextRequest): Promise<NextResponse> {
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

    const key = `${metric.name}:${metric.id}`;
    metricsBuffer.delete(key);
    if (metricsBuffer.size >= MAX_BUFFER_SIZE) {
      const oldest = metricsBuffer.keys().next().value;
      if (oldest !== undefined) metricsBuffer.delete(oldest);
    }
    metricsBuffer.set(key, metric);

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

interface MetricSamples {
  values: number[];
  ratings: Record<MetricRating, number>;
}

/** 値を並べた配列の p 分位（0〜1）。空なら 0 */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

/**
 * GET /api/telemetry/vitals
 *
 * Returns aggregated Web Vitals metrics for monitoring (admin only)
 */
async function getHandler(): Promise<NextResponse> {
  // page ごと・指標ごとに集める。page は送り手が決める値なので、プレーンなオブジェクトのキーにしない
  const aggregated = new Map<string, Map<MetricName, MetricSamples>>();

  for (const metric of metricsBuffer.values()) {
    let byName = aggregated.get(metric.page);
    if (!byName) {
      byName = new Map();
      aggregated.set(metric.page, byName);
    }
    let samples = byName.get(metric.name);
    if (!samples) {
      samples = {
        values: [],
        ratings: { good: 0, 'needs-improvement': 0, poor: 0 },
      };
      byName.set(metric.name, samples);
    }
    samples.values.push(metric.value);
    samples.ratings[metric.rating]++;
  }

  // Object.fromEntries はどのキーも自分のプロパティとして作る（__proto__ でも代入にならない）
  const pages = Object.fromEntries(
    Array.from(aggregated, ([page, byName]) => [
      page,
      Object.fromEntries(
        Array.from(byName, ([name, samples]) => {
          const sorted = [...samples.values].sort((a, b) => a - b);
          return [
            name,
            {
              p50: percentile(sorted, 0.5),
              p75: percentile(sorted, 0.75),
              p95: percentile(sorted, 0.95),
              ratings: samples.ratings,
            },
          ];
        })
      ),
    ])
  );

  return NextResponse.json({
    bufferSize: metricsBuffer.size,
    maxBufferSize: MAX_BUFFER_SIZE,
    pages,
  });
}

// 計測はログインしていない閲覧者からも届くので、認証は付けずに IP 単位で制限する
export const POST = withRateLimit('write:telemetry-vitals', postHandler);
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
