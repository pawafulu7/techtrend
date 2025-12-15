'use client';

import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  'Frontend': 'from-cyan-500 to-blue-600',
  'Backend': 'from-emerald-500 to-green-600',
  'DevOps': 'from-orange-500 to-red-600',
  'Security': 'from-rose-500 to-pink-600',
  'Database': 'from-amber-500 to-yellow-600',
  'Mobile': 'from-indigo-500 to-blue-600',
};

const CATEGORY_BG_COLORS: Record<string, string> = {
  'AI/ML': 'bg-violet-500/10',
  'Frontend': 'bg-cyan-500/10',
  'Backend': 'bg-emerald-500/10',
  'DevOps': 'bg-orange-500/10',
  'Security': 'bg-rose-500/10',
  'Database': 'bg-amber-500/10',
  'Mobile': 'bg-indigo-500/10',
};

export function CategoryDistribution({ categories, loading = false }: CategoryDistributionProps) {
  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Category Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...categories.map(c => c.count), 1);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Category Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map((category, index) => {
            const gradientClass = CATEGORY_COLORS[category.name] || 'from-gray-500 to-slate-600';
            const bgClass = CATEGORY_BG_COLORS[category.name] || 'bg-gray-500/10';
            const widthPercent = (category.count / maxCount) * 100;

            return (
              <div
                key={category.name}
                className={cn("p-4 rounded-xl animate-slide-in", bgClass)}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full bg-gradient-to-r", gradientClass)} />
                    <span className="font-semibold text-sm">{category.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">{category.count}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({category.percentage}%)
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-background/50 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r animate-grow-width", gradientClass)}
                    style={{
                      '--target-width': `${widthPercent}%`,
                      animationDelay: `${200 + index * 50}ms`
                    } as React.CSSProperties}
                  />
                </div>

                {/* Top article */}
                {category.topArticle && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    Top: {category.topArticle.translatedTitle || category.topArticle.title}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <style jsx>{`
          @keyframes slideIn {
            from { opacity: 0; transform: translateX(-20px); }
            to { opacity: 1; transform: translateX(0); }
          }
          @keyframes growWidth {
            from { width: 0; }
            to { width: var(--target-width); }
          }
          .animate-slide-in {
            animation: slideIn 0.3s ease-out forwards;
            opacity: 0;
          }
          .animate-grow-width {
            animation: growWidth 0.5s ease-out forwards;
            width: 0;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
