'use client';

import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { HotTopicChip } from './topic-card';
import { UpdatedRow, DeprecatedBadge } from './topic-list-items';
import type {
  ArticleInfo,
  ChangeWithCategory,
  DiffSummaryResponse,
} from './diff-utils';

interface DiffMainContentProps {
  data: DiffSummaryResponse;
  grouped: {
    new: ChangeWithCategory[];
    trending: ChangeWithCategory[];
    updated: ChangeWithCategory[];
    deprecated: ChangeWithCategory[];
  };
  articles: Record<string, ArticleInfo>;
  hoveredTopic: string | null;
  onHoverEnter: (key: string) => void;
  onHoverLeave: () => void;
}

export function DiffMainContent({
  data,
  grouped,
  articles,
  hoveredTopic,
  onHoverEnter,
  onHoverLeave,
}: DiffMainContentProps) {
  return (
    <main className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
      {/* Stats Bar */}
      <div className="bg-background flex items-center justify-center gap-6 rounded-lg border px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">{grouped.new.length}</span>
          <span className="text-muted-foreground text-xs">新規</span>
        </div>
        <div className="bg-border h-4 w-px" />
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sky-500" />
          <span className="text-sm font-semibold">
            {grouped.trending.length}
          </span>
          <span className="text-muted-foreground text-xs">急上昇</span>
        </div>
        <div className="bg-border h-4 w-px" />
        <div className="flex items-center gap-2">
          <Minus className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold">
            {grouped.updated.length}
          </span>
          <span className="text-muted-foreground text-xs">継続</span>
        </div>
        <div className="bg-border h-4 w-px" />
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-slate-300" />
          <span className="text-sm font-semibold">
            {grouped.deprecated.length}
          </span>
          <span className="text-muted-foreground text-xs">下火</span>
        </div>
      </div>

      {/* Hot Topics Section */}
      {(grouped.new.length > 0 || grouped.trending.length > 0) && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-amber-300 via-orange-300 to-sky-300 dark:from-amber-700 dark:via-orange-700 dark:to-sky-700" />
            <h2 className="text-muted-foreground px-2 text-xs font-bold tracking-widest">
              今週の注目トピック
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-amber-300 via-orange-300 to-sky-300 dark:from-amber-700 dark:via-orange-700 dark:to-sky-700" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {grouped.new.slice(0, 8).map((change, i) => (
              <HotTopicChip
                key={`new-${i}`}
                change={change}
                variant="new"
                articles={articles}
                hoveredTopic={hoveredTopic}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
              />
            ))}
            {grouped.trending.slice(0, 4).map((change, i) => (
              <HotTopicChip
                key={`trending-${i}`}
                change={change}
                variant="trending"
                articles={articles}
                hoveredTopic={hoveredTopic}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
              />
            ))}
          </div>
        </section>
      )}

      {/* Continuing Topics */}
      {grouped.updated.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide">
              継続中のトピック ({grouped.updated.length})
            </h2>
          </div>
          <div className="bg-background rounded-lg border p-2 shadow-sm">
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped.updated.slice(0, 12).map((change, i) => (
                <UpdatedRow key={`updated-${i}`} change={change} />
              ))}
            </div>
            {grouped.updated.length > 12 && (
              <div className="mt-2 border-t pt-2 text-center">
                <span className="text-muted-foreground text-xs">
                  他 {grouped.updated.length - 12} 件
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Fading Topics */}
      {grouped.deprecated.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5 text-slate-300" />
            <h2 className="text-muted-foreground/70 text-xs font-medium tracking-wide">
              下火のトピック ({grouped.deprecated.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {grouped.deprecated.slice(0, 15).map((change, i) => (
              <DeprecatedBadge key={`deprecated-${i}`} change={change} />
            ))}
            {grouped.deprecated.length > 15 && (
              <Badge
                variant="outline"
                className="text-muted-foreground/50 border-dashed text-xs"
              >
                他 {grouped.deprecated.length - 15} 件
              </Badge>
            )}
          </div>
        </section>
      )}

      {/* Category Summary */}
      {data.data.length > 0 && (
        <section className="border-t pt-4">
          <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wide">
            カテゴリ別
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {data.data.map((summary) => (
              <div
                key={summary.categorySlug}
                className="bg-background hover:bg-muted/50 flex items-center justify-between rounded border px-3 py-2 transition-colors"
              >
                <span className="truncate text-xs font-medium">
                  {summary.categoryName}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {summary.changes.length}件
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
