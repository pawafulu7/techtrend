'use client';

import { useState, useEffect } from 'react';
import {
  Cloud,
  Brain,
  Palette,
  Server,
  Shield,
  GitBranch,
  Database,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { CardV2 } from '@/components/ui-v2/card-v2';
import {
  SAMPLE_QUERIES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type SampleQuery,
} from '../_data/sample-queries';
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
const getCategoryColors = (
  category: SampleQuery['category'],
  isDark: boolean
) => {
  const colors = isDark
    ? darkCategoryColors[category]
    : lightCategoryColors[category];
  return colors;
};

interface AgentSampleQueriesProps {
  onSelectQuery: (query: string) => void;
  className?: string;
  queries?: readonly string[];
  layout?: 'grid' | 'sidebar';
}

export function AgentSampleQueries({
  onSelectQuery,
  className,
  queries,
  layout = 'grid',
}: AgentSampleQueriesProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Mounted state to avoid hydration mismatch with next-themes
  // During SSR, resolvedTheme is undefined, so we default to light theme
  // and only switch to actual theme after client hydration
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: SSR-safe mount tracking
  useEffect(() => setMounted(true), []);

  // Use light theme colors during SSR/initial render to avoid hydration mismatch
  const effectiveIsDark = mounted ? isDark : false;

  // 従来のqueries propsが渡された場合は既存の表示形式を維持
  if (queries && queries.length > 0) {
    return (
      <div className={className}>
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-4">
          {queries.map((query, index) => (
            <button
              key={`${query}-${index}`}
              onClick={() => onSelectQuery(query)}
              className="border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 max-w-xs rounded-md border px-4 text-left text-xs whitespace-normal transition-colors"
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
  const groupedQueries = SAMPLE_QUERIES.reduce<
    Record<SampleQuery['category'], SampleQuery[]>
  >(
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
        <h2 className="mb-4 text-sm font-semibold text-[var(--tt-color-text)]">
          カテゴリから探す
        </h2>
        <div className="flex w-full flex-col gap-2">
          {CATEGORY_ORDER.map((category) => {
            const categoryQueries = groupedQueries[category];
            if (!categoryQueries?.length) return null;

            const firstQuery = categoryQueries[0];
            const IconComponent = CATEGORY_ICON_MAP[category];
            const colors = getCategoryColors(category, effectiveIsDark);

            return (
              <CardV2
                key={category}
                variant="ghost"
                className="group w-full cursor-pointer border border-[var(--tt-color-border)] transition-colors hover:border-[var(--tt-color-primary)] hover:bg-[var(--tt-color-surface-1)]"
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
                    className="shrink-0 rounded-full p-2"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <IconComponent
                      className="h-4 w-4"
                      style={{ color: colors.icon }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="line-clamp-2 text-xs text-[var(--tt-color-text-muted)]">
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
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORY_ORDER.map((category) => {
          const categoryQueries = groupedQueries[category];
          if (!categoryQueries || categoryQueries.length === 0) return null;

          const IconComponent = CATEGORY_ICON_MAP[category];
          const firstQuery = categoryQueries[0];

          const colors = getCategoryColors(category, effectiveIsDark);

          return (
            <CardV2
              key={category}
              variant="ghost"
              className="group cursor-pointer border border-[var(--tt-color-border)] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[var(--tt-color-primary)] hover:shadow-[var(--tt-shadow-card-hover)]"
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
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className="rounded-full p-3 transition-colors group-hover:brightness-95"
                  style={{ backgroundColor: colors.bg }}
                >
                  <IconComponent
                    className="h-5 w-5 transition-colors"
                    style={{ color: colors.icon }}
                    aria-hidden="true"
                  />
                </div>
                <span className="text-sm font-medium">
                  {CATEGORY_LABELS[category]}
                </span>
                <span className="line-clamp-2 text-xs text-[var(--tt-color-text-muted)]">
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
