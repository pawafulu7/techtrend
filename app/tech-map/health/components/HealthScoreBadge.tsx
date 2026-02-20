'use client';

import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import type { BadgeV2Variant } from '@/components/ui-v2/badge-v2';

interface ScoreRange {
  label: string;
  variant: BadgeV2Variant;
}

function getScoreRange(score: number): ScoreRange {
  if (score >= 80) return { label: 'Excellent', variant: 'positive' };
  if (score >= 60) return { label: 'Good', variant: 'info' };
  if (score >= 40) return { label: 'Fair', variant: 'secondary' };
  return { label: 'At Risk', variant: 'destructive' };
}

interface HealthScoreBadgeProps {
  score: number;
  className?: string;
}

export function HealthScoreBadge({ score, className }: HealthScoreBadgeProps) {
  const { label, variant } = getScoreRange(score);

  return (
    <BadgeV2 variant={variant} className={className}>
      {label}
    </BadgeV2>
  );
}
