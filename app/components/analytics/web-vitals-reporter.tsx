'use client';

import { useEffect } from 'react';
import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals';

/**
 * Sampling rate for Web Vitals reporting (5%)
 * Reduces server load while maintaining statistical significance
 */
const SAMPLING_RATE = 0.05;

/**
 * Check if current session should be sampled
 * Uses sessionStorage to maintain consistency within a session
 */
function shouldSample(): boolean {
  if (typeof window === 'undefined') return false;

  const key = 'webVitalsSampled';
  const cached = sessionStorage.getItem(key);

  if (cached !== null) {
    return cached === 'true';
  }

  const sampled = Math.random() < SAMPLING_RATE;
  sessionStorage.setItem(key, String(sampled));
  return sampled;
}

/**
 * Send Web Vitals metric to telemetry endpoint
 */
function sendVital(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    id: metric.id,
    rating: metric.rating,
    navigationType: metric.navigationType,
    page: window.location.pathname,
    timestamp: Date.now(),
  });

  // Use sendBeacon for reliable delivery
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/telemetry/vitals', body);
  } else {
    // Fallback to fetch with keepalive
    fetch('/api/telemetry/vitals', {
      method: 'POST',
      body,
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Silently ignore errors - telemetry should not affect UX
    });
  }
}

/**
 * Web Vitals Reporter Component
 *
 * Measures and reports Core Web Vitals:
 * - LCP (Largest Contentful Paint)
 * - INP (Interaction to Next Paint) - replaces FID
 * - CLS (Cumulative Layout Shift)
 * - FCP (First Contentful Paint)
 * - TTFB (Time to First Byte)
 *
 * Uses 5% sampling to reduce server load
 */
export function WebVitalsReporter(): null {
  useEffect(() => {
    // Skip if not sampled
    if (!shouldSample()) {
      return;
    }

    // Register metric handlers
    onLCP(sendVital);
    onINP(sendVital);
    onCLS(sendVital);
    onFCP(sendVital);
    onTTFB(sendVital);
  }, []);

  return null;
}
