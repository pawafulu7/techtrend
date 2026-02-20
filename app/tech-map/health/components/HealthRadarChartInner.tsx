'use client';

import { useState, useEffect } from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useChartColors } from '@/app/components/trends/useChartColors';
import type { RadarDataPoint } from '../types';

function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

interface HealthRadarChartInnerProps {
  data: RadarDataPoint[];
  entityName: string;
}

export default function HealthRadarChartInner({
  data,
  entityName,
}: HealthRadarChartInnerProps) {
  const colors = useChartColors();

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const radarColor = getCssVar('--tt-color-info', '') || colors[0];
  const textSecondary = getCssVar('--tt-color-text-secondary', '#6b7280');
  const borderColor = getCssVar('--tt-color-border', '#e5e7eb');
  const textMuted = getCssVar('--tt-color-text-muted', '#9ca3af');

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} aria-label={`Radar chart for ${entityName}`}>
        <PolarGrid stroke={borderColor} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: textSecondary, fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: textMuted, fontSize: 10 }}
        />
        <Radar
          name="Health"
          dataKey="value"
          stroke={radarColor}
          fill={radarColor}
          fillOpacity={0.3}
          isAnimationActive={!prefersReducedMotion}
        />
        <Tooltip
          formatter={(value?: number, name?: string) => [
            value != null ? `${Number(value).toFixed(1)}` : '---',
            name ?? '',
          ]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
