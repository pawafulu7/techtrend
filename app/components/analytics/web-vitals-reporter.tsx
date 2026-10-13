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

/** bfcache から戻ったときのパス。戻った後の計測は、このページのものとして送る */
let bfcacheRestoredPath: string | undefined;

/**
 * 計測の対象になったページのパス。CLS・INP はページを離れるときに確定するので、
 * クライアント遷移の後だと送る時点の URL は別のページになっている。web-vitals の
 * navigationURL（計測を始めた文書の URL）を使い、無ければ今のパスにする。
 * bfcache から戻ったときの navigationURL は最初に開いた URL のままなので、戻ったときのパスにする
 */
function metricPage(metric: Metric): string {
  if (metric.navigationType === 'back-forward-cache') {
    return bfcacheRestoredPath ?? window.location.pathname;
  }
  if (metric.navigationURL) {
    try {
      return new URL(metric.navigationURL).pathname;
    } catch {
      // 解釈できない URL は今のパスで代える
    }
  }
  return window.location.pathname;
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
    page: metricPage(metric),
    timestamp: Date.now(),
  });

  // Use sendBeacon for reliable delivery（Wrap in Blob to set Content-Type header）。
  // 受け付けなかったとき（false）は fetch で送り直す
  if (
    navigator.sendBeacon?.(
      '/api/telemetry/vitals',
      new Blob([body], { type: 'application/json' })
    )
  ) {
    return;
  }

  // sendBeacon が断るのは、送信中のデータが上限に達したときなど。その上限は keepalive の
  // fetch と共通なので、表示中は上限の無い通常の fetch で送り、離れる途中（hidden）だけ keepalive にする
  fetch('/api/telemetry/vitals', {
    method: 'POST',
    body,
    keepalive: document.visibilityState === 'hidden',
    headers: {
      'Content-Type': 'application/json',
    },
  }).catch(() => {
    // Silently ignore errors - telemetry should not affect UX
  });
}

/**
 * web-vitals の on* は1ページで1回だけ呼ぶ。開発時の StrictMode は effect を2回走らせるので、
 * 登録済みかをモジュールで覚えておかないと、同じ計測を2回送る
 */
let handlersRegistered = false;

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
    if (handlersRegistered || !shouldSample()) {
      return;
    }
    handlersRegistered = true;

    // web-vitals も pageshow を capture で受け、戻った直後に TTFB を送る。同じ capture で先に
    // 登録して、それより前に戻ったときのパスを覚える
    window.addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) bfcacheRestoredPath = window.location.pathname;
      },
      { capture: true }
    );

    // Register metric handlers
    onLCP(sendVital);
    onINP(sendVital);
    onCLS(sendVital);
    onFCP(sendVital);
    onTTFB(sendVital);
  }, []);

  return null;
}
