/**
 * Personalization Tracing Utilities
 *
 * Shared OTEL tracer and helper functions for the personalization pipeline.
 * All span lifecycle management is handled via measureAsync() to prevent
 * span.end() leaks.
 *
 * TraceQL examples (Grafana Cloud):
 *   { name="personalization.filterArticles" && duration > 2s }
 *   { name="personalization.stage2_fetch" } | select(duration)
 *   { name="personalization.filterArticles" && span.centroidsLockWaitMs > 500 }
 *   { name="personalization.filterArticles" && span.fallback=true }
 *   { name="personalization.filterArticles" && !span.fallback }
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span, AttributeValue } from '@opentelemetry/api';

export { Span };

/**
 * Named tracer for the personalization pipeline.
 * All personalization spans are grouped under the 'personalization' instrumentation scope.
 */
export const tracer = trace.getTracer('personalization');

/**
 * Wrap an async function in an OTEL span.
 * Handles exception recording, status propagation, and span.end() automatically.
 *
 * @param spanName - The span name (e.g. 'personalization.stage1_knn')
 * @param fn - Async function receiving the span for attribute setting
 * @param attributes - Optional initial attributes set before fn is called
 */
export async function measureAsync<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, AttributeValue>
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    if (attributes) {
      span.setAttributes(attributes);
    }
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err instanceof Error ? err : String(err));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Convert a process.hrtime.bigint() start timestamp to elapsed milliseconds.
 *
 * @param start - Value from process.hrtime.bigint() at the start of the measurement
 * @returns Elapsed time in milliseconds (fractional)
 */
export function hrtimeDiffMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}
