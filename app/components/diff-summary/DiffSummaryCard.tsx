'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDown,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DiffChange {
  type: 'new' | 'updated' | 'deprecated' | 'trending';
  topic: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  relatedArticleIds?: string[];
}

interface DiffSummaryCardProps {
  categorySlug: string;
  categoryName: string;
  currentPeriod: string;
  baselinePeriod: string;
  changes: DiffChange[];
  unchanged: string[];
  generatedAt: string;
}

const changeTypeConfig = {
  new: {
    icon: Sparkles,
    label: '新規',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    badgeVariant: 'default' as const,
  },
  trending: {
    icon: TrendingUp,
    label: '急上昇',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    badgeVariant: 'secondary' as const,
  },
  updated: {
    icon: RefreshCw,
    label: '更新',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    badgeVariant: 'outline' as const,
  },
  deprecated: {
    icon: ArrowDown,
    label: '減少',
    color: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-800/50',
    badgeVariant: 'outline' as const,
  },
};

const significanceColor = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-300',
};

export function DiffSummaryCard({
  categorySlug: _categorySlug,
  categoryName,
  currentPeriod,
  baselinePeriod,
  changes,
  unchanged,
  generatedAt,
}: DiffSummaryCardProps) {
  const hasChanges = changes.length > 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>{categoryName}</span>
          <Badge variant="outline" className="text-xs font-normal">
            {currentPeriod}
          </Badge>
        </CardTitle>
        <p className="text-muted-foreground text-xs">vs {baselinePeriod}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasChanges ? (
          <div className="space-y-3">
            {changes.slice(0, 5).map((change, index) => {
              const config = changeTypeConfig[change.type];
              const Icon = config.icon;

              return (
                <div
                  key={`${change.topic}-${index}`}
                  className={cn(
                    'rounded-lg border-l-4 p-3',
                    config.bgColor,
                    significanceColor[change.significance]
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 flex-shrink-0',
                        config.color
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {change.topic}
                        </span>
                        <Badge
                          variant={config.badgeVariant}
                          className="text-xs"
                        >
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {change.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {changes.length > 5 && (
              <p className="text-muted-foreground text-center text-xs">
                他 {changes.length - 5} 件の変化
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Minus className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">大きな変化なし</p>
          </div>
        )}

        {unchanged.length > 0 && hasChanges && (
          <div className="border-t pt-2">
            <p className="text-muted-foreground text-xs">
              継続中: {unchanged.slice(0, 3).join(', ')}
              {unchanged.length > 3 && ` 他${unchanged.length - 3}件`}
            </p>
          </div>
        )}

        <div className="text-muted-foreground pt-2 text-right text-xs">
          生成:{' '}
          {new Date(generatedAt).toLocaleString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </CardContent>
    </Card>
  );
}
