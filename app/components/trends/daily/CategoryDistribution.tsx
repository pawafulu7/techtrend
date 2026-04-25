'use client';

import { Layers } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui-v2/card-v2';
import { cn } from '@/lib/utils';

interface CategoryInfo {
  name: string;
  count: number;
  percentage: number;
  topArticle?: {
    id: string;
    title: string;
    translatedTitle?: string | null;
  } | null;
}

interface CategoryDistributionProps {
  categories: CategoryInfo[];
  loading?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  'AI/ML': 'from-violet-500 to-purple-600',
  Frontend: 'from-cyan-500 to-blue-600',
  Backend: 'from-emerald-500 to-green-600',
  DevOps: 'from-orange-500 to-red-600',
  Security: 'from-rose-500 to-pink-600',
  Database: 'from-amber-500 to-yellow-600',
  Mobile: 'from-indigo-500 to-blue-600',
};

// Card 背景は category 識別を gradient (dot/progress bar) に委ねるため neutral surface に統一
const CATEGORY_BG_CLASS = 'bg-[var(--tt-color-surface-muted)]';

export function CategoryDistribution({
  categories,
  loading = false,
}: CategoryDistributionProps) {
  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="text-primary h-5 w-5" />
            カテゴリ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted h-16 rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="text-primary h-5 w-5" />
          カテゴリ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map((category, index) => {
            const gradientClass =
              CATEGORY_COLORS[category.name] || 'from-gray-500 to-slate-600';
            const bgClass = CATEGORY_BG_CLASS;
            // パーセンテージをそのままバーの幅に使用（総記事数に対する割合）
            const widthPercent = category.percentage;

            return (
              <div
                key={category.name}
                className={cn('tt-cat-slide-in rounded-xl p-4', bgClass)}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full bg-gradient-to-r',
                        gradientClass
                      )}
                    />
                    <span className="text-sm font-semibold">
                      {category.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">{category.count}</span>
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({category.percentage}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="bg-background/50 h-2 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'tt-cat-grow-width h-full rounded-full bg-gradient-to-r',
                      gradientClass
                    )}
                    style={
                      {
                        '--target-width': `${widthPercent}%`,
                        animationDelay: `${200 + index * 50}ms`,
                      } as React.CSSProperties
                    }
                  />
                </div>

                {/* Top article */}
                {category.topArticle && (
                  <p className="text-muted-foreground mt-2 truncate text-xs">
                    Top:{' '}
                    {category.topArticle.translatedTitle ||
                      category.topArticle.title}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <style jsx>{`
          @keyframes ttCatSlideIn {
            from {
              opacity: 0;
              transform: translateX(-20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes ttCatGrowWidth {
            from {
              width: 0;
            }
            to {
              width: var(--target-width);
            }
          }
          .tt-cat-slide-in {
            animation: ttCatSlideIn 0.3s ease-out forwards;
            opacity: 0;
          }
          .tt-cat-grow-width {
            animation: ttCatGrowWidth 0.5s ease-out forwards;
            width: 0;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
