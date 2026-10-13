/**
 * Web Vitals の計測の検証と、集計用のバッファ
 */
import { z } from 'zod';
import { listAllValues } from '@/lib/utils/list-all-values';
import type {
  MetricName,
  MetricRating,
  NavigationType,
} from '@/lib/telemetry/web-vitals-types';

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

// 受け取る文字列の上限。上限が無いと、巨大な値をバッファ（最大 1000 件）とログに残せる
const MAX_ID_LENGTH = 128;
const MAX_PAGE_LENGTH = 2048;

/**
 * Validation schema for Web Vitals payload
 */
export const webVitalsSchema = z.object({
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

export type WebVitalsMetric = z.infer<typeof webVitalsSchema>;

/**
 * In-memory storage for Web Vitals metrics
 * In production, this would be sent to a time-series database or analytics service
 *
 * 同じ計測（name と id）は、送り直されるたびに最新の値で置き換える。CLS・INP はタブを
 * 隠すたびに同じ id で送られるので、別のサンプルとして数えると二重に計上する。
 * 置き換えても入れた順の位置は変えず、溢れたら最初に届いた計測から捨てる
 */
const metricsBuffer = new Map<string, WebVitalsMetric>();
export const MAX_BUFFER_SIZE = 1000;

export function storeMetric(metric: WebVitalsMetric): void {
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

/** バッファにある計測（届いた順） */
export function bufferedMetrics(): IterableIterator<WebVitalsMetric> {
  return metricsBuffer.values();
}

export function bufferSize(): number {
  return metricsBuffer.size;
}
