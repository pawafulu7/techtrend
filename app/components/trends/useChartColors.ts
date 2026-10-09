'use client';

import { useSyncExternalStore } from 'react';
import { chartColors } from '@/lib/design-tokens';

// 系列の色は lib/design-tokens/ の chartColors（--tt-color-chart-N）。状態色とは別に持つ
const CSS_VARS = chartColors.light.map((_, i) => `--tt-color-chart-${i + 1}`);

const FALLBACK_COLORS: string[] = [...chartColors.light];

function resolveColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const resolved = CSS_VARS.map((v) => style.getPropertyValue(v).trim());
  if (resolved.every((c) => c)) {
    return resolved;
  }
  return FALLBACK_COLORS;
}

let cachedColors = FALLBACK_COLORS;
let cachedKey = FALLBACK_COLORS.join(',');
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    const colors = resolveColors();
    const key = colors.join(',');
    if (key !== cachedKey) {
      cachedKey = key;
      cachedColors = colors;
      listeners.forEach((cb) => cb());
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  });
}

function stopObserver(): void {
  if (listeners.size > 0) return;
  observer?.disconnect();
  observer = null;
}

function subscribe(callback: () => void): () => void {
  // Resolve initial colors on first subscribe
  if (listeners.size === 0) {
    const newColors = resolveColors();
    const newKey = newColors.join(',');
    if (newKey !== cachedKey) {
      cachedKey = newKey;
      cachedColors = newColors;
    }
  }

  listeners.add(callback);
  startObserver();

  return () => {
    listeners.delete(callback);
    stopObserver();
  };
}

function getSnapshot(): string[] {
  return cachedColors;
}

function getServerSnapshot(): string[] {
  return FALLBACK_COLORS;
}

export function useChartColors(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
