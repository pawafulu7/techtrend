'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { MaturityBadge } from './MaturityBadge';
import type { TrendScoreResult } from '@/lib/types/trend-types';

interface TrendScoreCardProps {
  score: TrendScoreResult;
  selected: boolean;
  onClick: (entityId: string) => void;
}

function GrowthIndicator({ label, value }: { label: string; value: number }) {
  const isPositive = value > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center gap-1 text-xs">
      <Icon
        className={`h-3 w-3 ${
          isPositive
            ? 'text-(--tt-color-positive)'
            : 'text-(--tt-color-negative)'
        }`}
      />
      <span className="text-(--tt-color-text-muted)">{label}</span>
      <span
        className={
          isPositive
            ? 'text-(--tt-color-positive)'
            : 'text-(--tt-color-negative)'
        }
      >
        {isPositive ? '+' : ''}
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

export function TrendScoreCard({
  score,
  selected,
  onClick,
}: TrendScoreCardProps) {
  return (
    <CardV2
      variant="hover"
      className={`cursor-pointer ${selected ? 'ring-primary ring-2' : ''}`}
      onClick={() => onClick(score.entityId)}
    >
      <CardV2Content className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-foreground truncate font-semibold">
              {score.entityName}
            </h3>
            <p className="text-xs text-(--tt-color-text-muted)">
              {score.entityType}
            </p>
          </div>
          <div className="ml-3 text-right">
            <div className="text-foreground text-2xl font-bold">
              {Math.round(score.score)}
            </div>
            <MaturityBadge stage={score.stage} />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <GrowthIndicator
            label="Articles"
            value={score.components.articleMentionGrowth}
          />
          <GrowthIndicator
            label="GitHub"
            value={score.components.githubStarsGrowth}
          />
          <GrowthIndicator
            label="npm"
            value={score.components.npmDownloadsGrowth}
          />
          <GrowthIndicator
            label="SO"
            value={score.components.soQuestionsGrowth}
          />
        </div>
      </CardV2Content>
    </CardV2>
  );
}
