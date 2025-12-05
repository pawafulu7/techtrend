/**
 * Web Vitals Telemetry Types
 */

/**
 * Web Vitals metric names
 */
export type MetricName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';

/**
 * Rating categories for Web Vitals
 */
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

/**
 * Navigation type from Performance API
 */
export type NavigationType =
  | 'navigate'
  | 'reload'
  | 'back-forward'
  | 'back-forward-cache'
  | 'prerender';

/**
 * Web Vitals metric payload from client
 */
export interface WebVitalsPayload {
  name: MetricName;
  value: number;
  delta: number;
  id: string;
  rating: MetricRating;
  navigationType: NavigationType;
  page: string;
  timestamp: number;
}

/**
 * Aggregated metrics for a page
 */
export interface PageMetrics {
  page: string;
  lcp: MetricSummary;
  inp: MetricSummary;
  cls: MetricSummary;
  fcp: MetricSummary;
  ttfb: MetricSummary;
  sampleCount: number;
  lastUpdated: number;
}

/**
 * Summary statistics for a single metric
 */
export interface MetricSummary {
  p50: number;
  p75: number;
  p95: number;
  goodCount: number;
  needsImprovementCount: number;
  poorCount: number;
}

/**
 * Thresholds for Web Vitals (from web.dev)
 */
export const WEB_VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
} as const;
