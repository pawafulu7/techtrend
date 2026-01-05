'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Zap,
  ArrowUpRight,
  Minus,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import {
  getISOWeek,
  getPreviousISOWeek,
  getNextISOWeek,
} from '@/lib/ai/diff-summary';

interface ArticleInfo {
  id: string;
  title: string;
}

interface DiffSummaryData {
  categorySlug: string;
  categoryName: string;
  currentPeriod: string;
  baselinePeriod: string;
  changes: DiffChange[];
  unchanged: string[];
  modelVersion: string;
  promptVersion: string;
  generatedAt: string;
}

interface DiffSummaryResponse {
  success: boolean;
  week: string;
  previousWeek: string;
  data: DiffSummaryData[];
  meta: {
    totalCategories: number;
    summarizedCategories: number;
  };
}

interface ChangeWithCategory extends DiffChange {
  category: string;
}

export default function DiffSummaryPage() {
  const [data, setData] = useState<DiffSummaryResponse | null>(null);
  const [articles, setArticles] = useState<Record<string, ArticleInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // デフォルトは前週（完了した週）を表示
  const [selectedWeek, setSelectedWeek] = useState(() =>
    getPreviousISOWeek(getISOWeek(new Date()))
  );
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);

  const currentWeek = getISOWeek(new Date());
  const canGoNext = selectedWeek < currentWeek;

  const fetchArticleTitles = useCallback(async (articleIds: string[]) => {
    if (articleIds.length === 0) return;
    try {
      const response = await fetch(
        `/api/articles?ids=${articleIds.slice(0, 20).join(',')}&fields=id,title`
      );
      if (response.ok) {
        const result = await response.json();
        const articlesMap: Record<string, ArticleInfo> = {};
        result.articles?.forEach((a: ArticleInfo) => {
          articlesMap[a.id] = a;
        });
        setArticles((prev) => ({ ...prev, ...articlesMap }));
      }
    } catch {
      // Silent fail
    }
  }, []);

  const fetchData = useCallback(
    async (week: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/ai/diff-summary?week=${week}`);
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to fetch data');
        }
        setData(result);
        const allArticleIds: string[] = result.data.flatMap(
          (d: DiffSummaryData) =>
            d.changes.flatMap((c) => c.relatedArticleIds || [])
        );
        if (allArticleIds.length > 0) {
          fetchArticleTitles([...new Set(allArticleIds)] as string[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [fetchArticleTitles]
  );

  useEffect(() => {
    fetchData(selectedWeek);
  }, [selectedWeek, fetchData]);

  const handlePreviousWeek = () =>
    setSelectedWeek(getPreviousISOWeek(selectedWeek));
  const handleNextWeek = () =>
    canGoNext && setSelectedWeek(getNextISOWeek(selectedWeek));

  const getGroupedChanges = useCallback(() => {
    if (!data) return { new: [], trending: [], updated: [], deprecated: [] };

    const allChanges: ChangeWithCategory[] = data.data.flatMap((d) =>
      d.changes.map((c) => ({ ...c, category: d.categoryName }))
    );

    // タイプの優先度（高い順）
    const typePriority: Record<DiffChange['type'], number> = {
      trending: 0,
      new: 1,
      updated: 2,
      deprecated: 3,
    };

    // トピック名を正規化してグルーピングキーを生成
    const normalizeTopicKey = (topic: string): string => {
      // 修飾語リスト（親トピックに寄せる）
      const modifiers = [
        'code',
        'sdk',
        'cli',
        'api',
        'framework',
        'library',
        'tool',
        'tools',
        'client',
        'server',
      ];
      let normalized = topic.toLowerCase().trim();
      // 連続空白を単一空白に
      normalized = normalized.replace(/\s+/g, ' ');
      // 修飾語を除去
      for (const mod of modifiers) {
        normalized = normalized.replace(new RegExp(`\\b${mod}\\b`, 'g'), '');
      }
      // 再度trim と空白正規化
      normalized = normalized.replace(/\s+/g, ' ').trim();
      return normalized;
    };

    // 全変更を正規化キーでグルーピング
    const groupedByKey = new Map<
      string,
      { changes: ChangeWithCategory[]; displayTopic: string }
    >();

    for (const change of allChanges) {
      const key = normalizeTopicKey(change.topic);
      if (!groupedByKey.has(key)) {
        groupedByKey.set(key, { changes: [], displayTopic: change.topic });
      }
      const group = groupedByKey.get(key)!;
      group.changes.push(change);
      // 表示用トピック名は短い方を採用
      if (change.topic.length < group.displayTopic.length) {
        group.displayTopic = change.topic;
      }
    }

    // 各グループから優先度最高のタイプを選択し、カテゴリをマージ
    const mergedChanges: ChangeWithCategory[] = [];

    for (const [, group] of groupedByKey) {
      // 優先度順にソート
      const sorted = [...group.changes].sort(
        (a, b) => typePriority[a.type] - typePriority[b.type]
      );
      const best = sorted[0];

      // カテゴリをマージ（重複除去）
      const categories = new Set<string>();
      for (const c of group.changes) {
        categories.add(c.category);
      }
      const mergedCategory = Array.from(categories).join('、');

      mergedChanges.push({
        ...best,
        topic: group.displayTopic,
        category: mergedCategory,
      });
    }

    // タイプ別に分類して返す
    return {
      new: mergedChanges.filter((c) => c.type === 'new'),
      trending: mergedChanges.filter((c) => c.type === 'trending'),
      updated: mergedChanges.filter((c) => c.type === 'updated'),
      deprecated: mergedChanges.filter((c) => c.type === 'deprecated'),
    };
  }, [data]);

  const grouped = getGroupedChanges();
  const totalChanges = Object.values(grouped).flat().length;

  const formatWeekDisplay = (week: string) => {
    const match = week.match(/^(\d{4})-W(\d{2})$/);
    return match ? `${match[1]}年 第${parseInt(match[2], 10)}週` : week;
  };

  // Compact topic chip for hot items
  const HotTopicChip = ({
    change,
    variant,
  }: {
    change: ChangeWithCategory;
    variant: 'new' | 'trending';
  }) => {
    const isNew = variant === 'new';
    const relatedArticles = (change.relatedArticleIds || [])
      .slice(0, 2)
      .map((id) => articles[id])
      .filter(Boolean);
    const isHovered = hoveredTopic === `${variant}-${change.topic}`;

    return (
      <div
        className={cn(
          'group relative rounded-lg transition-all duration-200',
          'bg-background border shadow-sm',
          isNew
            ? 'border-l-4 border-l-amber-500 hover:border-amber-300'
            : 'border-l-4 border-l-sky-500 hover:border-sky-300',
          'hover:-translate-y-0.5 hover:shadow-md'
        )}
        onMouseEnter={() => setHoveredTopic(`${variant}-${change.topic}`)}
        onMouseLeave={() => setHoveredTopic(null)}
      >
        <div className="p-4">
          {/* Header row */}
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {isNew ? (
                <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              ) : (
                <Zap className="h-4 w-4 text-sky-500 dark:text-sky-400" />
              )}
              <span
                className={cn(
                  'text-xs font-bold',
                  isNew
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-sky-600 dark:text-sky-400'
                )}
              >
                {isNew ? '新規' : '急上昇'}
              </span>
            </div>
            <span className="text-muted-foreground text-xs">
              {change.category}
            </span>
          </div>

          {/* Topic name */}
          <Link
            href={`/?search=${encodeURIComponent(change.topic)}`}
            className="group/link block"
          >
            <h3 className="text-foreground text-lg leading-snug font-semibold decoration-1 underline-offset-2 group-hover/link:underline">
              {change.topic}
            </h3>
          </Link>

          {/* Description */}
          <p className="text-muted-foreground mt-1.5 line-clamp-3 text-sm leading-relaxed">
            {change.description}
          </p>

          {/* Related articles on hover */}
          {isHovered && relatedArticles.length > 0 && (
            <div className="animate-in fade-in mt-2 space-y-1 border-t border-current/10 pt-2 duration-150">
              {relatedArticles.map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.id}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                >
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{article.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick action */}
        <Link
          href={`/?search=${encodeURIComponent(change.topic)}`}
          className={cn(
            'absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100',
            isNew
              ? 'text-amber-600 hover:bg-amber-100'
              : 'text-sky-600 hover:bg-sky-100'
          )}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  };

  // Minimal row for updated items
  const UpdatedRow = ({ change }: { change: ChangeWithCategory }) => (
    <Link
      href={`/?search=${encodeURIComponent(change.topic)}`}
      className="hover:bg-muted/50 group flex items-center gap-3 rounded px-3 py-2 transition-colors"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="flex-1 truncate text-base font-medium">
        {change.topic}
      </span>
      <span className="text-muted-foreground hidden max-w-[200px] truncate text-sm sm:block">
        {change.category}
      </span>
      <ArrowUpRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );

  // Faded badge for deprecated items
  const DeprecatedBadge = ({ change }: { change: ChangeWithCategory }) => (
    <Link href={`/?search=${encodeURIComponent(change.topic)}`}>
      <Badge
        variant="outline"
        className="border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-200 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      >
        {change.topic}
      </Badge>
    </Link>
  );

  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">
      {/* Header */}
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousWeek}
              disabled={loading}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">前週</span>
            </Button>

            <div className="text-center">
              <h1 className="text-base font-bold tracking-tight">
                週間トピック変化
              </h1>
              <div className="flex items-center justify-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {formatWeekDisplay(selectedWeek)}
                </span>
                {selectedWeek === currentWeek && (
                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                    今週
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextWeek}
              disabled={loading || !canGoNext}
              className="gap-1 text-xs"
            >
              <span className="hidden sm:inline">次週</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Error state */}
      {error && !loading && (
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchData(selectedWeek)}
                className="ml-4 gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                再試行
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="bg-muted h-16 rounded-lg" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-muted h-28 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      ) : data && totalChanges > 0 ? (
        <main className="container mx-auto max-w-6xl space-y-8 px-4 py-6">
          {/* Stats Bar */}
          <div className="bg-background flex items-center justify-center gap-6 rounded-lg border px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">
                {grouped.new.length}
              </span>
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

          {/* Hot Topics Section - New & Trending in grid */}
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
                  />
                ))}
                {grouped.trending.slice(0, 4).map((change, i) => (
                  <HotTopicChip
                    key={`trending-${i}`}
                    change={change}
                    variant="trending"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Continuing Topics - Compact list */}
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

          {/* Fading Topics - Badge row */}
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

          {/* Category Summary - Compact grid */}
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
      ) : (
        <div className="container mx-auto max-w-6xl px-4 py-16 text-center">
          <div className="bg-muted mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full">
            <Minus className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">データがありません</h3>
          <p className="text-muted-foreground text-sm">
            {formatWeekDisplay(selectedWeek)}のデータはまだ生成されていません。
          </p>
        </div>
      )}
    </div>
  );
}
