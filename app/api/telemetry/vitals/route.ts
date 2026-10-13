import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { AppError, formatErrorResponse } from '@/lib/errors';
import { listAllValues } from '@/lib/utils/list-all-values';
import { readJsonWithLimit } from '@/lib/utils/http/read-json-with-limit';
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

// 受け取る文字列と本文の上限。上限が無いと、巨大な本文を読ませたり、バッファ（最大 1000 件）と
// ログに残したりできる。本文は id・page が上限いっぱいでも 3KB に届かない
const MAX_ID_LENGTH = 128;
const MAX_PAGE_LENGTH = 2048;
const MAX_BODY_BYTES = 4096;

/**
 * Validation schema for Web Vitals payload
 */
const webVitalsSchema = z.object({
  name: z.enum(METRIC_NAMES),
  value: z.number().finite().nonnegative(),
  // INP は送り直すたびに下がることもあるので、差分は負にもなる
  delta: z.number().finite(),
  // web-vitals の id は v6-<時刻>-<乱数>。ログにも出すので、page と同じく表示できる ASCII だけ受ける
  id: z
    .string()
    .min(1)
    .max(MAX_ID_LENGTH)
    .regex(/^[\x21-\x7e]+$/),
  rating: z.enum(METRIC_RATINGS),
  navigationType: z.enum(NAVIGATION_TYPES),
  // reporter が送るのは URL の pathname（/ で始まり、パーセントエンコード済みの表示できる ASCII）。
  // それ以外（__proto__、//host、制御文字など）は受けない
  page: z
    .string()
    .max(MAX_PAGE_LENGTH)
    .regex(/^\/(?!\/)[\x21-\x7e]*$/),
  timestamp: z.number().int().nonnegative(),
});

type WebVitalsMetric = z.infer<typeof webVitalsSchema>;

/**
 * In-memory storage for Web Vitals metrics
 * In production, this would be sent to a time-series database or analytics service
 *
 * 同じ計測（name と id）は、送り直されるたびに最新の値で置き換える。CLS・INP はタブを
 * 隠すたびに同じ id で送られるので、別のサンプルとして数えると二重に計上する。
 * 置き換えても入れた順の位置は変えず、溢れたら最初に届いた計測から捨てる
 */
const metricsBuffer = new Map<string, WebVitalsMetric>();
const MAX_BUFFER_SIZE = 1000;

function storeMetric(metric: WebVitalsMetric): void {
  const key = `${metric.name}:${metric.id}`;
  const stored = metricsBuffer.get(key);
  if (stored) {
    // 送信の順が入れ替わって、古い値が後から届いたら捨てる
    if (stored.timestamp <= metric.timestamp) metricsBuffer.set(key, metric);
    return;
  }
  if (metricsBuffer.size >= MAX_BUFFER_SIZE) {
    const oldest = metricsBuffer.keys().next().value;
    if (oldest !== undefined) metricsBuffer.delete(oldest);
  }
  metricsBuffer.set(key, metric);
}

/**
 * POST /api/telemetry/vitals
 *
 * Receives Web Vitals metrics from client-side reporter
 * Stores in buffer for aggregation and analysis
 */
async function postHandler(request: NextRequest): Promise<NextResponse> {
  try {
    // handler が読むのは上限まで。JSON として読めない本文は、形の合わない本文と同じく 400 にする
    const body = await readJsonWithLimit(request, MAX_BODY_BYTES);
    if (!body.ok && body.reason === 'too_large') {
      return NextResponse.json(
        formatErrorResponse(
          new AppError('Request body is too large', 'PAYLOAD_TOO_LARGE', 413)
        ),
        { status: 413 }
      );
    }
    const parsed = webVitalsSchema.safeParse(body.ok ? body.value : undefined);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const metric = parsed.data;

    // Log metric for analysis (structured logging)。同じ計測の送り直しを後で見分けられるよう、
    // id と送った時刻も載せる
    logger.info({
      type: 'web_vital',
      metric: metric.name,
      id: metric.id,
      value: metric.value,
      rating: metric.rating,
      page: metric.page,
      navigationType: metric.navigationType,
      sentAt: metric.timestamp,
    });

    storeMetric(metric);

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

  return NextResponse.json(
    {
      bufferSize: metricsBuffer.size,
      maxBufferSize: MAX_BUFFER_SIZE,
      pages,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

// 計測はログインしていない閲覧者からも届くので、認証は付けずに IP 単位で制限する。
// セッションは使わないので引かない（引くとログイン中の閲覧者ごとに認証の DB を引く）
export const POST = withRateLimit('write:telemetry-vitals', postHandler, {
  resolveSession: false,
});
export const GET = withAdminAuth(withRateLimit('admin:read', getHandler));
