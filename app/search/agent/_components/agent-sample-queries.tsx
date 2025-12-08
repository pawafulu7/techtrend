'use client';

import { Cloud, Brain, Palette, Server, Shield, type LucideIcon } from 'lucide-react';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { SAMPLE_QUERIES, CATEGORY_LABELS, CATEGORY_ORDER, type SampleQuery } from '../_data/sample-queries';

// カテゴリアイコンマッピング
const CATEGORY_ICON_MAP: Record<SampleQuery['category'], LucideIcon> = {
  infrastructure: Cloud,
  ai: Brain,
  frontend: Palette,
  backend: Server,
  security: Shield,
};

interface AgentSampleQueriesProps {
  onSelectQuery: (query: string) => void;
  className?: string;
  queries?: readonly string[];
}

export function AgentSampleQueries({ onSelectQuery, className, queries }: AgentSampleQueriesProps) {
  // 従来のqueries propsが渡された場合は既存の表示形式を維持
  if (queries && queries.length > 0) {
    return (
      <div className={className}>
        <div className="flex flex-wrap gap-4 justify-center max-w-3xl mx-auto">
          {queries.map((query, index) => (
            <button
              key={`${query}-${index}`}
              onClick={() => onSelectQuery(query)}
              className="text-xs h-11 px-4 whitespace-normal text-left max-w-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label={query}
            >
              {query}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // カテゴリ別にグループ化
  const groupedQueries = SAMPLE_QUERIES.reduce<Record<SampleQuery['category'], SampleQuery[]>>(
    (acc, query) => {
      const category = query.category;
      const bucket = acc[category] ?? (acc[category] = []);
      bucket.push(query);
      return acc;
    },
    {} as Record<SampleQuery['category'], SampleQuery[]>
  );

  return (
    <div className={className}>
      {/* カテゴリタイルグリッド - 2x2 モバイル、3カラム タブレット、5カラム デスクトップ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-4xl mx-auto">
        {CATEGORY_ORDER.map((category) => {
          const categoryQueries = groupedQueries[category];
          if (!categoryQueries || categoryQueries.length === 0) return null;

          const IconComponent = CATEGORY_ICON_MAP[category];
          const firstQuery = categoryQueries[0];

          return (
            <CardV2
              key={category}
              variant="ghost"
              className="group cursor-pointer p-4 hover:-translate-y-1 hover:shadow-[var(--tt-shadow-card-hover)] transition-all duration-200 border border-[var(--tt-color-border)] hover:border-[var(--tt-color-primary)]"
              onClick={() => onSelectQuery(firstQuery.text)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectQuery(firstQuery.text);
                }
              }}
              aria-label={`${CATEGORY_LABELS[category]}カテゴリで検索: ${firstQuery.text}`}
              data-testid={`category-tile-${category}`}
            >
              <div className="flex flex-col items-center text-center gap-2">
                <div className="p-2 rounded-lg bg-[var(--tt-color-primary)]/10 group-hover:bg-[var(--tt-color-primary)]/20 transition-colors">
                  <IconComponent className="h-6 w-6 text-[var(--tt-color-primary)]" aria-hidden="true" />
                </div>
                <span className="font-medium text-sm">{CATEGORY_LABELS[category]}</span>
                <span className="text-xs text-[var(--tt-color-text-muted)] line-clamp-2">
                  {firstQuery.text}
                </span>
              </div>
            </CardV2>
          );
        })}
      </div>
    </div>
  );
}
