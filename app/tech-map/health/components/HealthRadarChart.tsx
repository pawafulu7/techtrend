'use client';

import dynamic from 'next/dynamic';
import type { HealthScoreResult, RadarDataPoint } from '../types';
import { HEALTH_AXIS_LABELS } from '../types';

const HealthRadarChartInner = dynamic(() => import('./HealthRadarChartInner'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
  ),
});

interface HealthRadarChartProps {
  health: HealthScoreResult;
  loading?: boolean;
}

type AxisKey = keyof typeof HEALTH_AXIS_LABELS;

function transformToRadarData(health: HealthScoreResult): RadarDataPoint[] {
  const axisKeys: AxisKey[] = [
    'communityActivity',
    'developmentVelocity',
    'articleAttention',
    'adoptionBreadth',
  ];

  return axisKeys.map((key) => ({
    axis: HEALTH_AXIS_LABELS[key],
    value: health.axes[key] ?? 0,
    fullMark: 100,
  }));
}

export default function HealthRadarChart({
  health,
  loading = false,
}: HealthRadarChartProps) {
  if (loading) {
    return (
      <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
    );
  }

  const data = transformToRadarData(health);

  return (
    <div aria-label={`Health radar chart for ${health.entityName}`}>
      <HealthRadarChartInner data={data} entityName={health.entityName} />
      <table className="sr-only" role="table" aria-label="Health scores">
        <thead>
          <tr>
            <th>Axis</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.axis}>
              <td>{d.axis}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
