'use client';

import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  TrendingUp,
  FileText,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Plus,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import {
  parseTrendAiSummary,
  type TrendAiSummary,
  type TrendAiSummaryV2,
} from '@/lib/types/trend-ai-summary';

interface DailyTrendHeroProps {
  aiSummary?: string;
  articleCount: number;
  periodStart: string;
  generatedAt?: string;
  topTags?: { name: string; count: number }[];
  topArticles?: Array<{
    id: string;
    title: string;
    translatedTitle?: string | null;
    url: string;
    sourceName: string;
    viewCount: number;
    favoriteCount: number;
    score: number;
    tags: string[];
    thumbnail?: string | null;
  }>;
  evidenceArticles?: Record<
    string,
    {
      title: string;
      translatedTitle?: string | null;
      thumbnail?: string | null;
      sourceName: string;
    }
  >;
  navigation?: {
    prevDate: string | null;
    nextDate: string | null;
  };
  onPrevDay?: () => void;
  onNextDay?: () => void;
}

type TopArticle = NonNullable<DailyTrendHeroProps['topArticles']>[number];

type LegacyAISummary = {
  topics: Array<{ topic: string; reason: string }>;
  actionText: string | null;
};

function parseLegacyAISummary(text: string): LegacyAISummary | null {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const topicsSectionMatch = normalized.match(
    /\[注目トピック\][\s\S]*?(?=\n\s*\[アクションポイント\]|\s*$)/
  );
  const actionSectionMatch = normalized.match(/\[アクションポイント\][\s\S]*$/);

  const topicsSection = topicsSectionMatch?.[0] ?? normalized;
  const actionSection = actionSectionMatch?.[0] ?? '';

  const topics: LegacyAISummary['topics'] = [];
  for (const line of topicsSection.split('\n')) {
    const m = line.trim().match(/^\(\d+\)\s*([^:：]+)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    topics.push({ topic: m[1].trim(), reason: m[2].trim() });
  }

  const actionText = actionSection
    ? actionSection.replace(/^\[アクションポイント\]\s*/m, '').trim()
    : null;

  if (topics.length === 0 && !actionText) return null;
  return { topics, actionText: actionText || null };
}

function ArticleCitations({
  articleIds,
  topArticlesById,
}: {
  articleIds: string[];
  topArticlesById: Map<string, TopArticle>;
}) {
  const resolved = articleIds
    .map((id) => topArticlesById.get(id))
    .filter((a): a is TopArticle => Boolean(a))
    .slice(0, 3);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {resolved.map((a) => (
        <Link
          key={a.id}
          href={`/articles/${a.id}?from=${encodeURIComponent('/trends/daily')}`}
          className="bg-muted/50 hover:bg-muted block rounded-md px-2 py-1 transition-colors"
        >
          <div className="line-clamp-1 text-sm leading-snug font-medium">
            {a.translatedTitle || a.title}
          </div>
          <div className="text-muted-foreground text-xs">
            {a.sourceName} · score {a.score} · views {a.viewCount} · fav{' '}
            {a.favoriteCount}
          </div>
        </Link>
      ))}
    </div>
  );
}

function TrendChangesBadges({
  trendChanges,
}: {
  trendChanges: TrendAiSummaryV2['trendChanges'];
}) {
  if (!trendChanges) return null;

  const hasChanges =
    trendChanges.new.length > 0 ||
    trendChanges.rising.length > 0 ||
    trendChanges.falling.length > 0;
  if (!hasChanges) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {trendChanges.new.slice(0, 2).map((t) => (
        <Badge
          key={`new:${t.topic}`}
          className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        >
          <Plus className="h-3 w-3" />
          {t.topic}
        </Badge>
      ))}
      {trendChanges.rising.slice(0, 2).map((t) => (
        <Badge
          key={`rising:${t.topic}`}
          className="gap-1 border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400"
        >
          <ArrowUp className="h-3 w-3" />
          {t.topic} +{t.deltaCount}
        </Badge>
      ))}
      {trendChanges.falling.slice(0, 2).map((t) => (
        <Badge
          key={`falling:${t.topic}`}
          className="gap-1 border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400"
        >
          <ArrowDown className="h-3 w-3" />
          {t.topic} -{t.deltaCount}
        </Badge>
      ))}
    </div>
  );
}

function KeyTopicArticleCards({
  articleIds,
  topArticlesById,
  evidenceArticles,
}: {
  articleIds: string[];
  topArticlesById: Map<string, TopArticle>;
  evidenceArticles: Record<
    string,
    {
      title: string;
      translatedTitle?: string | null;
      thumbnail?: string | null;
      sourceName: string;
    }
  >;
}) {
  const resolved = articleIds
    .map((id) => {
      const topArticle = topArticlesById.get(id);
      if (topArticle)
        return {
          id: topArticle.id,
          title: topArticle.translatedTitle || topArticle.title,
          thumbnail: topArticle.thumbnail,
          sourceName: topArticle.sourceName,
          url: topArticle.url,
        };
      const ev = evidenceArticles[id];
      if (ev)
        return {
          id,
          title: ev.translatedTitle || ev.title,
          thumbnail: ev.thumbnail,
          sourceName: ev.sourceName,
          url: null,
        };
      return null;
    })
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .slice(0, 5);

  if (resolved.length === 0) return null;

  return (
    <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {resolved.map((a) => {
        const content = (
          <div className="bg-background/50 hover:bg-muted/50 w-[180px] flex-shrink-0 overflow-hidden rounded-lg border transition-colors">
            {a.thumbnail ? (
              <div className="bg-muted relative h-[100px] w-full">
                <img
                  src={a.thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="bg-muted absolute inset-0 hidden h-full w-full items-center justify-center">
                  <span className="text-muted-foreground text-xs">
                    {a.sourceName}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-muted flex h-[100px] w-full items-center justify-center">
                <span className="text-muted-foreground text-xs">
                  {a.sourceName}
                </span>
              </div>
            )}
            <div className="p-2">
              <p className="line-clamp-2 text-xs leading-snug font-medium">
                {a.title}
              </p>
              <p className="text-muted-foreground mt-1 text-[10px]">
                {a.sourceName}
              </p>
            </div>
          </div>
        );

        if (a.url) {
          return (
            <Link
              key={a.id}
              href={`/articles/${a.id}?from=${encodeURIComponent('/trends/daily')}`}
              className="flex-shrink-0"
            >
              {content}
            </Link>
          );
        }
        return (
          <div key={a.id} className="flex-shrink-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function StructuredAISummaryView({
  summary,
  topArticlesById,
  evidenceArticles,
}: {
  summary: TrendAiSummary;
  topArticlesById: Map<string, TopArticle>;
  evidenceArticles: Record<
    string,
    {
      title: string;
      translatedTitle?: string | null;
      thumbnail?: string | null;
      sourceName: string;
    }
  >;
}) {
  if (summary.version === 'trend_ai_summary_v2') {
    return (
      <div className="flex-1 space-y-6">
        {/* Core Statement - Hero */}
        <div className="from-primary/10 via-primary/5 rounded-xl bg-gradient-to-r to-transparent p-6">
          <p className="text-foreground text-xl leading-tight font-semibold sm:text-2xl">
            {summary.core}
          </p>
        </div>

        {/* Trend Changes Summary - Prominent */}
        {summary.trendChanges && summary.trendChanges.available && (
          <div className="bg-card/50 rounded-xl border p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="text-primary h-5 w-5" />
              <span className="text-foreground text-sm font-semibold">
                {summary.trendChanges.basis?.periodLabel || 'トレンド変化'}
              </span>
            </div>
            <p className="text-foreground/80 mb-4 text-sm leading-relaxed">
              {summary.trendChanges.summary}
            </p>
            <TrendChangesBadges trendChanges={summary.trendChanges} />
          </div>
        )}

        {/* Main Content Grid: Key Topics (8cols) + Sidebar (4cols) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Key Topics - Main Area */}
          <div className="space-y-4 lg:col-span-8">
            <div className="text-muted-foreground text-xs font-semibold tracking-wide">
              注目トピック
            </div>
            <div className="space-y-4">
              {summary.keyTopics.slice(0, 4).map((t) => (
                <div
                  key={t.topic}
                  className="bg-card/50 hover:bg-card/80 rounded-xl border p-4 transition-colors sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Badge
                      variant="secondary"
                      className="shrink-0 self-start px-3 py-1 text-sm"
                    >
                      {t.topic}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground text-sm leading-relaxed font-medium">
                        {t.whatHappened}
                      </p>
                      <p className="text-foreground/70 mt-2 text-sm leading-relaxed">
                        {t.whyItMatters}
                      </p>
                    </div>
                  </div>
                  {t.evidenceArticleIds && t.evidenceArticleIds.length > 0 && (
                    <div className="border-border/50 mt-3 border-t pt-3">
                      <KeyTopicArticleCards
                        articleIds={t.evidenceArticleIds}
                        topArticlesById={topArticlesById}
                        evidenceArticles={evidenceArticles}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar - Actions */}
          <div className="lg:col-span-4">
            <Accordion
              type="single"
              collapsible
              defaultValue="actions"
              className="w-full"
            >
              <AccordionItem
                value="actions"
                className="bg-card/50 rounded-xl border"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="text-primary h-4 w-4" />
                    <span className="text-sm font-semibold">アクション</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {summary.actions.slice(0, 3).map((a, idx) => (
                      <div
                        key={a.action}
                        className="bg-muted/30 rounded-lg p-3"
                      >
                        <div className="flex items-start gap-2">
                          <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground line-clamp-2 text-sm font-medium">
                              {a.action}
                            </p>
                            <p className="text-foreground/70 mt-1 line-clamp-2 text-xs">
                              {a.reason}
                            </p>
                            {a.articleIds.length > 0 && (
                              <div className="mt-2">
                                <ArticleCitations
                                  articleIds={a.articleIds.slice(0, 1)}
                                  topArticlesById={topArticlesById}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="text-foreground text-xl leading-snug font-semibold">
        {summary.headline}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-7">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide">
            注目トピック
          </div>
          <div className="mt-2 space-y-3">
            {summary.keyTopics.slice(0, 3).map((t) => (
              <div
                key={t.topic}
                className="bg-background/50 rounded-lg border p-3"
              >
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {t.topic}
                  </Badge>
                  <div className="text-foreground/90 text-sm leading-relaxed">
                    {t.reason}
                  </div>
                </div>
                {t.evidenceArticleIds && t.evidenceArticleIds.length > 0 && (
                  <ArticleCitations
                    articleIds={t.evidenceArticleIds}
                    topArticlesById={topArticlesById}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-5">
          <div className="text-muted-foreground text-xs font-semibold tracking-wide">
            注目の数字
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(summary.numbers ?? []).slice(0, 4).map((n) => (
              <div
                key={`${n.label}:${n.value}`}
                className="bg-muted/50 rounded-lg p-3"
              >
                <div className="text-muted-foreground text-xs">{n.label}</div>
                <div className="text-foreground text-sm font-semibold">
                  {n.value}
                </div>
              </div>
            ))}
          </div>

          <div className="text-muted-foreground mt-4 text-xs font-semibold tracking-wide">
            アクションポイント
          </div>
          <div className="mt-2 space-y-2">
            {summary.actions.slice(0, 3).map((a) => (
              <div key={a.title} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="text-primary mt-0.5 h-4 w-4" />
                  <div className="min-w-0">
                    <div className="text-foreground text-sm font-semibold">
                      {a.title}
                    </div>
                    <div className="text-foreground/80 mt-0.5 text-sm leading-relaxed">
                      {a.detail}
                    </div>
                    {a.relatedArticleIds && a.relatedArticleIds.length > 0 && (
                      <ArticleCitations
                        articleIds={a.relatedArticleIds}
                        topArticlesById={topArticlesById}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyAISummaryView({ summary }: { summary: LegacyAISummary }) {
  return (
    <div className="flex-1">
      {summary.topics.length > 0 && (
        <>
          <div className="text-muted-foreground text-xs font-semibold tracking-wide">
            注目トピック
          </div>
          <div className="mt-2 space-y-2">
            {summary.topics.slice(0, 3).map((t) => (
              <div key={t.topic} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {t.topic}
                  </Badge>
                  <div className="text-foreground/90 text-sm leading-relaxed">
                    {t.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {summary.actionText && (
        <>
          <div className="text-muted-foreground mt-4 text-xs font-semibold tracking-wide">
            アクションポイント
          </div>
          <div className="bg-muted/30 text-foreground/90 mt-2 rounded-lg p-3 text-sm leading-relaxed">
            {summary.actionText}
          </div>
        </>
      )}
    </div>
  );
}

export function DailyTrendHero({
  aiSummary,
  articleCount,
  periodStart,
  generatedAt,
  topTags = [],
  topArticles = [],
  navigation,
  onPrevDay,
  onNextDay,
  evidenceArticles = {},
}: DailyTrendHeroProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return '日付不明';
    }
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  };

  const structuredSummary = parseTrendAiSummary(aiSummary);
  const legacySummary =
    !structuredSummary && aiSummary ? parseLegacyAISummary(aiSummary) : null;
  const topArticlesById = new Map(topArticles.map((a) => [a.id, a] as const));

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="from-primary/5 to-secondary/5 absolute inset-0 bg-gradient-to-br via-transparent" />
      <div className="bg-primary/10 absolute top-0 right-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
      <div className="bg-secondary/10 absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 py-6 sm:py-8">
        {/* Header with navigation - compact */}
        <div className="animate-fade-in mb-4">
          <div className="flex items-center justify-between">
            {/* Left: Previous day button */}
            <div className="w-24 sm:w-28">
              {navigation?.prevDate && onPrevDay && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrevDay}
                  className="gap-1"
                  aria-label="前日のトレンドを表示"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline" aria-hidden="true">
                    前日
                  </span>
                </Button>
              )}
            </div>

            {/* Center: Title and date */}
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-xl p-2">
                <TrendingUp className="text-primary h-5 w-5" />
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Daily Trend
                </h1>
                <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm sm:justify-start">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(periodStart)}
                </p>
              </div>
            </div>

            {/* Right: Next day button */}
            <div className="flex w-24 justify-end sm:w-28">
              {navigation?.nextDate && onNextDay && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNextDay}
                  className="gap-1"
                  aria-label="翌日のトレンドを表示"
                >
                  <span className="hidden sm:inline" aria-hidden="true">
                    翌日
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Bar - Compact */}
        <div className="animate-fade-in mb-6 flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className="bg-muted/50 border-border/50 gap-2 px-3 py-1.5 text-sm"
          >
            <FileText className="h-3.5 w-3.5" />
            {articleCount.toLocaleString()}件
          </Badge>
          {topTags.slice(0, 5).map((tag, index) => (
            <Badge
              key={tag.name}
              variant="secondary"
              className={cn(
                'px-2.5 py-1 text-xs transition-all hover:scale-105',
                index === 0 &&
                  'bg-primary/90 text-primary-foreground hover:bg-primary/80',
                index === 1 &&
                  'bg-primary/70 text-primary-foreground hover:bg-primary/60',
                index === 2 &&
                  'bg-primary/50 text-primary-foreground hover:bg-primary/40'
              )}
            >
              {tag.name}
              <span className="ml-1 opacity-70">({tag.count})</span>
            </Badge>
          ))}
        </div>

        {/* AI Analysis - Full Width with softer styling */}
        <div className="animate-slide-in-left">
          <Card className="border-border/30 bg-card/80 border shadow-sm backdrop-blur-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-sm font-semibold">
                  AI分析
                </span>
                {generatedAt && (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {new Date(generatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>

              {aiSummary ? (
                structuredSummary ? (
                  <StructuredAISummaryView
                    summary={structuredSummary}
                    topArticlesById={topArticlesById}
                    evidenceArticles={evidenceArticles}
                  />
                ) : legacySummary ? (
                  <LegacyAISummaryView summary={legacySummary} />
                ) : (
                  <div className="flex-1">
                    <p className="text-foreground/90 text-lg leading-relaxed whitespace-pre-line">
                      {aiSummary}
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center py-12">
                  <p className="text-muted-foreground">AI分析は準備中です</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.5s ease-out 0.1s forwards;
          opacity: 0;
        }
        .animate-slide-in-right {
          animation: slideInRight 0.5s ease-out 0.2s forwards;
          opacity: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in,
          .animate-slide-in-left,
          .animate-slide-in-right {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
