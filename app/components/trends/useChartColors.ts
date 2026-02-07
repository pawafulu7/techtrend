'use client';

import { useMemo } from 'react';

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

export function useChartColors(): string[] {
  return useMemo(() => {
    if (typeof document === 'undefined') return FALLBACK_COLORS;
    const style = getComputedStyle(document.documentElement);
    const vars = [
      '--tt-color-info',
      '--tt-color-positive',
      '--tt-color-secondary',
      '--tt-color-negative',
      '--tt-color-primary',
    ];
    const resolved = vars.map((v) => style.getPropertyValue(v).trim());
    if (resolved.every((c) => c)) {
      return [
        ...resolved,
        '#8b5cf6',
        '#ec4899',
        '#06b6d4',
        '#d97706',
        '#6366f1',
      ];
    }
    return FALLBACK_COLORS;
  }, []);
}
