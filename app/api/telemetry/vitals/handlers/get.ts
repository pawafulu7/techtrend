/**
 * GET /api/telemetry/vitals
 *
 * Returns aggregated Web Vitals metrics for monitoring (admin only)
 */
import { NextResponse } from 'next/server';
import type {
  MetricName,
  MetricRating,
} from '@/lib/telemetry/web-vitals-types';
import { bufferedMetrics, bufferSize, MAX_BUFFER_SIZE } from './store';

interface MetricSamples {
  values: number[];
  ratings: Record<MetricRating, number>;
}

/** 値を並べた配列の p 分位（0〜1）。空なら 0 */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

export async function handleGet(): Promise<NextResponse> {
  // page ごと・指標ごとに集める。page は送り手が決める値なので、プレーンなオブジェクトのキーにしない
  const aggregated = new Map<string, Map<MetricName, MetricSamples>>();

  for (const metric of bufferedMetrics()) {
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
      bufferSize: bufferSize(),
      maxBufferSize: MAX_BUFFER_SIZE,
      pages,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
