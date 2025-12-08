'use client';

import { Cloud, Brain, Palette, Server, Shield, GitBranch, Database, Smartphone, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { CardV2 } from '@/components/ui-v2/card-v2';
import { SAMPLE_QUERIES, CATEGORY_LABELS, CATEGORY_ORDER, type SampleQuery } from '../_data/sample-queries';
import { lightCategoryColors, darkCategoryColors } from '@/lib/design-tokens';

// カテゴリアイコンマッピング
const CATEGORY_ICON_MAP: Record<SampleQuery['category'], LucideIcon> = {
  infrastructure: Cloud,
  ai: Brain,
  frontend: Palette,
  backend: Server,
  security: Shield,
  devops: GitBranch,
  database: Database,
  mobile: Smartphone,
};

// カテゴリ別カラー取得（ダークモード対応）
const getCategoryColors = (category: SampleQuery['category'], isDark: boolean) => {
  const colors = isDark ? darkCategoryColors[category] : lightCategoryColors[category];
  return colors;
};

interface AgentSampleQueriesProps {
  onSelectQuery: (query: string) => void;
  className?: string;
  queries?: readonly string[];
  layout?: 'grid' | 'sidebar';
}

export function AgentSampleQueries({ onSelectQuery, className, queries, layout = 'grid' }: AgentSampleQueriesProps) {
  // Note: During SSR and initial hydration, resolvedTheme may be undefined.
  // next-themes handles this gracefully, defaulting to system preference.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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

  // サイドバーレイアウト（縦並びリスト形式）
  if (layout === 'sidebar') {
    return (
      <div className={className}>
        <h2 className="text-sm font-semibold text-[var(--tt-color-text)] mb-4">
          カテゴリから探す
        </h2>
        <div className="flex flex-col gap-2 w-full">
          {CATEGORY_ORDER.map((category) => {
            const categoryQueries = groupedQueries[category];
            if (!categoryQueries?.length) return null;

            const firstQuery = categoryQueries[0];
            const IconComponent = CATEGORY_ICON_MAP[category];
            const colors = getCategoryColors(category, isDark);

            return (
              <CardV2
                key={category}
                variant="ghost"
                className="group w-full cursor-pointer border border-[var(--tt-color-border)] hover:border-[var(--tt-color-primary)] hover:bg-[var(--tt-color-surface-1)] transition-colors"
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
                <div className="flex items-start gap-3 p-3">
                  <div
                    className="p-2 rounded-full shrink-0"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <IconComponent
                      className="h-4 w-4"
                      style={{ color: colors.icon }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-sm">{CATEGORY_LABELS[category]}</span>
                    <span className="text-xs text-[var(--tt-color-text-muted)] line-clamp-2">
                      {firstQuery.text}
                    </span>
                  </div>
                </div>
              </CardV2>
            );
          })}
        </div>
      </div>
    );
  }

  // グリッドレイアウト（デフォルト）
  return (
    <div className={className}>
      {/* カテゴリタイルグリッド - 2x2 モバイル、3カラム タブレット、5カラム デスクトップ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
        {CATEGORY_ORDER.map((category) => {
          const categoryQueries = groupedQueries[category];
          if (!categoryQueries || categoryQueries.length === 0) return null;

          const IconComponent = CATEGORY_ICON_MAP[category];
          const firstQuery = categoryQueries[0];

          const colors = getCategoryColors(category, isDark);

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
                <div
                  className="p-3 rounded-full transition-colors group-hover:brightness-95"
                  style={{ backgroundColor: colors.bg }}
                >
                  <IconComponent
                    className="h-5 w-5 transition-colors"
                    style={{ color: colors.icon }}
                    aria-hidden="true"
                  />
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
