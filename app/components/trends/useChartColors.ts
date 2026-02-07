'use client';

import { useSyncExternalStore } from 'react';

const FALLBACK_COLORS = [
  '#3B82F6',
  '#22C55E',
  '#F97316',
  '#EF4444',
  '#16A34A',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#d97706',
  '#6366f1',
];

const CSS_VARS = [
  '--tt-color-info',
  '--tt-color-positive',
  '--tt-color-secondary',
  '--tt-color-negative',
  '--tt-color-primary',
];

const EXTRA_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#d97706', '#6366f1'];

function resolveColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const resolved = CSS_VARS.map((v) => style.getPropertyValue(v).trim());
  if (resolved.every((c) => c)) {
    return [...resolved, ...EXTRA_COLORS];
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
