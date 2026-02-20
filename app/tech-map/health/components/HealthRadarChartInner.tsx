'use client';

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

interface HealthRadarChartInnerProps {
  data: RadarDataPoint[];
  entityName: string;
}

export default function HealthRadarChartInner({
  data,
  entityName,
}: HealthRadarChartInnerProps) {
  const colors = useChartColors();

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Use info color from theme, fallback to first chart color
  const radarColor =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--tt-color-info')
          .trim() || colors[0]
      : colors[0];

  const textSecondary =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--tt-color-text-secondary')
          .trim() || '#6b7280'
      : '#6b7280';

  const borderColor =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--tt-color-border')
          .trim() || '#e5e7eb'
      : '#e5e7eb';

  const textMuted =
    typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
          .getPropertyValue('--tt-color-text-muted')
          .trim() || '#9ca3af'
      : '#9ca3af';

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
