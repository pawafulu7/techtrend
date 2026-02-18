'use client';

import { BadgeV2 } from '@/components/ui-v2/badge-v2';
import type { BadgeV2Variant } from '@/components/ui-v2/badge-v2';
import type { TechMaturityStage } from '@/lib/types/trend-types';

const STAGE_CONFIG: Record<
  TechMaturityStage,
  { label: string; variant: BadgeV2Variant }
> = {
  EMERGING: { label: 'Emerging', variant: 'info' },
  RISING: { label: 'Rising', variant: 'positive' },
  ESTABLISHED: { label: 'Established', variant: 'default' },
  DECLINING: { label: 'Declining', variant: 'destructive' },
};

interface MaturityBadgeProps {
  stage: TechMaturityStage;
  className?: string;
}

export function MaturityBadge({ stage, className }: MaturityBadgeProps) {
  const config = STAGE_CONFIG[stage];

  return (
    <BadgeV2 variant={config.variant} className={className}>
      {config.label}
    </BadgeV2>
  );
}
