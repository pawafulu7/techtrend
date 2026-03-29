'use client';

import { useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui-v2/card-v2';
import type { QualitySummary, QualityStatus } from '../_types';

interface CardConfig {
  label: string;
  count: number;
  statusValue: QualityStatus;
  colorClass: string;
}

interface QualitySummaryCardsProps {
  summary: QualitySummary;
  activeStatus: QualityStatus | '';
  onStatusClick: (status: QualityStatus | '') => void;
}

export function QualitySummaryCards({
  summary,
  activeStatus,
  onStatusClick,
}: QualitySummaryCardsProps) {
  const total = summary.totalArticles;

  const cards = useMemo<CardConfig[]>(
    () => [
      {
        label: '要約なし',
        count: summary.missingSummary,
        statusValue: 'missing_summary',
        colorClass: 'text-yellow-600 dark:text-yellow-400',
      },
      {
        label: 'カテゴリなし',
        count: summary.missingCategory,
        statusValue: 'missing_category',
        colorClass: 'text-orange-600 dark:text-orange-400',
      },
      {
        label: '重大低品質(score<30)',
        count: summary.lowQuality,
        statusValue: 'low_quality',
        colorClass: 'text-red-600 dark:text-red-400',
      },
      {
        label: '本文なし',
        count: summary.missingContent,
        statusValue: 'missing_content',
        colorClass: 'text-slate-600 dark:text-slate-400',
      },
    ],
    [summary]
  );

  const formatPercent = useCallback(
    (count: number) => {
      if (total === 0) return '0.0%';
      return `${((count / total) * 100).toFixed(1)}%`;
    },
    [total]
  );

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeStatus === card.statusValue;
        return (
          <button
            key={card.statusValue}
            onClick={() => onStatusClick(isActive ? '' : card.statusValue)}
            aria-pressed={isActive}
            aria-label={`${card.label}: ${card.count}件 (${formatPercent(card.count)})${isActive ? ' — フィルタ適用中' : ' — クリックしてフィルタ'}`}
            className="w-full text-left"
          >
            <Card
              className={`transition-all hover:shadow-md ${
                isActive ? 'ring-primary ring-2' : ''
              }`}
            >
              <CardContent className="p-4">
                <p className="text-muted-foreground text-sm">{card.label}</p>
                <p className={`mt-1 text-2xl font-bold ${card.colorClass}`}>
                  {card.count.toLocaleString()}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatPercent(card.count)} / 全{total.toLocaleString()}件
                </p>
              </CardContent>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
