'use client';

import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import { HealthScoreBadge } from './HealthScoreBadge';
import type { HealthScoreResult } from '../types';
import { HEALTH_AXIS_LABELS } from '../types';

interface HealthScoreCardProps {
  health: HealthScoreResult;
  selected: boolean;
  onClick: (entityId: string) => void;
}

type AxisKey = keyof typeof HEALTH_AXIS_LABELS;

interface AxisScoreIndicatorProps {
  label: string;
  value: number | null;
}

function getScoreColor(score: number): string {
  if (score >= 60) return 'text-(--tt-color-positive)';
  if (score >= 40) return 'text-(--tt-color-text-muted)';
  return 'text-(--tt-color-destructive)';
}

function getBarColor(score: number): string {
  if (score >= 60) return 'bg-(--tt-color-positive)';
  if (score >= 40) return 'bg-(--tt-color-text-muted)';
  return 'bg-(--tt-color-destructive)';
}

function AxisScoreIndicator({ label, value }: AxisScoreIndicatorProps) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-(--tt-color-text-muted)">{label}</span>
          <span className="text-(--tt-color-text-muted)">&mdash;</span>
        </div>
        <div className="h-1 w-full rounded-full bg-(--tt-color-border)">
          <div className="h-1 w-0 rounded-full" />
        </div>
      </div>
    );
  }

  const displayValue = Math.round(value);
  const colorClass = getScoreColor(displayValue);
  const barColorClass = getBarColor(displayValue);

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-(--tt-color-text-muted)">{label}</span>
        <span className={colorClass}>{displayValue}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-(--tt-color-border)">
        <div
          className={`h-1 rounded-full ${barColorClass}`}
          style={{ width: `${Math.min(displayValue, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function HealthScoreCard({
  health,
  selected,
  onClick,
}: HealthScoreCardProps) {
  const axisKeys: AxisKey[] = [
    'communityActivity',
    'developmentVelocity',
    'articleAttention',
    'adoptionBreadth',
  ];

  return (
    <CardV2
      variant="hover"
      className={`cursor-pointer ${selected ? 'ring-2 ring-(--tt-color-primary)' : ''}`}
      onClick={() => onClick(health.entityId)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(health.entityId);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`View health details for ${health.entityName}`}
    >
      <CardV2Content className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-foreground font-heading truncate font-semibold">
              {health.entityName}
            </h3>
            <div className="mt-1">
              <BadgeV2 variant="outline">{health.entityType}</BadgeV2>
            </div>
          </div>
          <div className="ml-3 text-right">
            <div className="text-foreground text-2xl font-bold">
              {Math.round(health.overallHealth)}
            </div>
            <HealthScoreBadge score={health.overallHealth} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {axisKeys.map((key) => (
            <AxisScoreIndicator
              key={key}
              label={HEALTH_AXIS_LABELS[key]}
              value={health.axes[key]}
            />
          ))}
        </div>
      </CardV2Content>
    </CardV2>
  );
}
