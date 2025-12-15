'use client';

import Link from 'next/link';
import { Sparkles, Calendar, TrendingUp, FileText, ChevronLeft, ChevronRight, CheckCircle2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
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
import { extractFirstJsonObject, TrendAiSummarySchema, type TrendAiSummary, type TrendAiSummaryV2 } from '@/lib/types/trend-ai-summary';

interface DailyTrendHeroProps {
  aiSummary?: string;
  articleCount: number;
  periodStart: string;
  periodEnd: string;
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
  }>;
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

function parseStructuredAISummary(text: string): TrendAiSummary | null {
  const json = extractFirstJsonObject(text);
  const parsed = TrendAiSummarySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function parseLegacyAISummary(text: string): LegacyAISummary | null {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const topicsSectionMatch = normalized.match(/\[注目トピック\][\s\S]*?(?=\n\s*\[アクションポイント\]|\s*$)/);
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
    .map(id => topArticlesById.get(id))
    .filter((a): a is TopArticle => Boolean(a))
    .slice(0, 3);

  if (resolved.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {resolved.map(a => (
        <Link
          key={a.id}
          href={`/articles/${a.id}?from=${encodeURIComponent('/trends/daily')}`}
          className="block rounded-md px-2 py-1 bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="text-sm font-medium leading-snug line-clamp-1">
            {a.translatedTitle || a.title}
          </div>
          <div className="text-xs text-muted-foreground">
            {a.sourceName} · score {a.score} · views {a.viewCount} · fav {a.favoriteCount}
          </div>
        </Link>
      ))}
    </div>
  );
}

function TrendChangesBadges({ trendChanges }: { trendChanges: TrendAiSummaryV2['trendChanges'] }) {
  if (!trendChanges) return null;

  const hasChanges = trendChanges.new.length > 0 || trendChanges.rising.length > 0 || trendChanges.falling.length > 0;
  if (!hasChanges) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {trendChanges.new.slice(0, 2).map((t) => (
        <Badge key={`new:${t.topic}`} className="gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
          <Plus className="h-3 w-3" />
          {t.topic}
        </Badge>
      ))}
      {trendChanges.rising.slice(0, 2).map((t) => (
        <Badge key={`rising:${t.topic}`} className="gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
          <ArrowUp className="h-3 w-3" />
          {t.topic} +{t.deltaCount}
        </Badge>
      ))}
      {trendChanges.falling.slice(0, 2).map((t) => (
        <Badge key={`falling:${t.topic}`} className="gap-1 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
          <ArrowDown className="h-3 w-3" />
          {t.topic} {t.deltaCount}
        </Badge>
      ))}
    </div>
  );
}

function StructuredAISummaryView({
  summary,
  topArticlesById,
}: {
  summary: TrendAiSummary;
  topArticlesById: Map<string, TopArticle>;
}) {
  if (summary.version === 'trend_ai_summary_v2') {
    return (
      <div className="flex-1 space-y-6">
        {/* Core Statement - Hero */}
        <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
          <p className="text-xl sm:text-2xl font-semibold leading-tight text-foreground">
            {summary.core}
          </p>
        </div>

        {/* Trend Changes Summary - Prominent */}
        {summary.trendChanges && summary.trendChanges.available && (
          <div className="rounded-xl border bg-card/50 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {summary.trendChanges.basis?.periodLabel || 'トレンド変化'}
              </span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed mb-4">
              {summary.trendChanges.summary}
            </p>
            <TrendChangesBadges trendChanges={summary.trendChanges} />
          </div>
        )}

        {/* Main Content Grid: Key Topics (8cols) + Sidebar (4cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Key Topics - Main Area */}
          <div className="lg:col-span-8 space-y-4">
            <div className="text-xs font-semibold text-muted-foreground tracking-wide">
              注目トピック
            </div>
            <div className="space-y-4">
              {summary.keyTopics.slice(0, 4).map((t) => (
                <div key={t.topic} className="rounded-xl border bg-card/50 p-4 sm:p-5 hover:bg-card/80 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <Badge variant="secondary" className="shrink-0 self-start text-sm px-3 py-1">
                      {t.topic}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-relaxed">
                        {t.whatHappened}
                      </p>
                      <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                        {t.whyItMatters}
                      </p>
                    </div>
                  </div>
                  {t.evidenceArticleIds && t.evidenceArticleIds.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <ArticleCitations articleIds={t.evidenceArticleIds} topArticlesById={topArticlesById} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar - Actions */}
          <div className="lg:col-span-4">
            <Accordion type="single" collapsible defaultValue="actions" className="w-full">
              <AccordionItem value="actions" className="border rounded-xl bg-card/50">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">アクション</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {summary.actions.slice(0, 3).map((a, idx) => (
                      <div key={a.action} className="rounded-lg bg-muted/30 p-3">
                        <div className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground line-clamp-2">
                              {a.action}
                            </p>
                            <p className="mt-1 text-xs text-foreground/70 line-clamp-2">
                              {a.reason}
                            </p>
                            {a.articleIds.length > 0 && (
                              <div className="mt-2">
                                <ArticleCitations articleIds={a.articleIds.slice(0, 1)} topArticlesById={topArticlesById} />
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
      <div className="text-xl font-semibold leading-snug text-foreground">
        {summary.headline}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7">
          <div className="text-xs font-semibold text-muted-foreground tracking-wide">
            注目トピック
          </div>
          <div className="mt-2 space-y-3">
            {summary.keyTopics.slice(0, 3).map((t) => (
              <div key={t.topic} className="rounded-lg border bg-background/50 p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {t.topic}
                  </Badge>
                  <div className="text-sm leading-relaxed text-foreground/90">
                    {t.reason}
                  </div>
                </div>
                {t.evidenceArticleIds && t.evidenceArticleIds.length > 0 && (
                  <ArticleCitations articleIds={t.evidenceArticleIds} topArticlesById={topArticlesById} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-5">
          <div className="text-xs font-semibold text-muted-foreground tracking-wide">
            注目の数字
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(summary.numbers ?? [])
              .slice(0, 4)
              .map((n) => (
                <div key={`${n.label}:${n.value}`} className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">{n.label}</div>
                  <div className="text-sm font-semibold text-foreground">{n.value}</div>
                </div>
              ))}
          </div>

          <div className="mt-4 text-xs font-semibold text-muted-foreground tracking-wide">
            アクションポイント
          </div>
          <div className="mt-2 space-y-2">
            {summary.actions.slice(0, 3).map((a) => (
              <div key={a.title} className="rounded-lg bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{a.title}</div>
                    <div className="text-sm text-foreground/80 leading-relaxed mt-0.5">
                      {a.detail}
                    </div>
                    {a.relatedArticleIds && a.relatedArticleIds.length > 0 && (
                      <ArticleCitations articleIds={a.relatedArticleIds} topArticlesById={topArticlesById} />
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

function LegacyAISummaryView({
  summary,
}: {
  summary: LegacyAISummary;
}) {
  return (
    <div className="flex-1">
      {summary.topics.length > 0 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground tracking-wide">
            注目トピック
          </div>
          <div className="mt-2 space-y-2">
            {summary.topics.slice(0, 3).map((t) => (
              <div key={t.topic} className="rounded-lg bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {t.topic}
                  </Badge>
                  <div className="text-sm leading-relaxed text-foreground/90">
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
          <div className="mt-4 text-xs font-semibold text-muted-foreground tracking-wide">
            アクションポイント
          </div>
          <div className="mt-2 rounded-lg bg-muted/30 p-3 text-sm leading-relaxed text-foreground/90">
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
  onNextDay
}: DailyTrendHeroProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  };

  const structuredSummary = aiSummary ? parseStructuredAISummary(aiSummary) : null;
  const legacySummary = !structuredSummary && aiSummary ? parseLegacyAISummary(aiSummary) : null;
  const topArticlesById = new Map(topArticles.map(a => [a.id, a] as const));

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative container mx-auto px-4 py-6 sm:py-8">
        {/* Header with navigation - compact */}
        <div className="mb-4 animate-fade-in">
          <div className="flex items-center justify-between">
            {/* Left: Previous day button */}
            <div className="w-24 sm:w-28">
              {navigation?.prevDate && onPrevDay && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrevDay}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">前日</span>
                </Button>
              )}
            </div>

            {/* Center: Title and date */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Daily Trend
                </h1>
                <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(periodStart)}
                </p>
              </div>
            </div>

            {/* Right: Next day button */}
            <div className="w-24 sm:w-28 flex justify-end">
              {navigation?.nextDate && onNextDay && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNextDay}
                  className="gap-1"
                >
                  <span className="hidden sm:inline">翌日</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Bar - Compact */}
        <div className="flex flex-wrap items-center gap-3 animate-fade-in mb-6">
          <Badge variant="outline" className="text-sm px-3 py-1.5 gap-2 bg-muted/50 border-border/50">
            <FileText className="h-3.5 w-3.5" />
            {articleCount.toLocaleString()}
          </Badge>
          {topTags.slice(0, 5).map((tag, index) => (
            <Badge
              key={tag.name}
              variant="secondary"
              className={cn(
                "px-2.5 py-1 text-xs transition-all hover:scale-105",
                index === 0 && "bg-primary/90 text-primary-foreground hover:bg-primary/80",
                index === 1 && "bg-primary/70 text-primary-foreground hover:bg-primary/60",
                index === 2 && "bg-primary/50 text-primary-foreground hover:bg-primary/40"
              )}
            >
              {tag.name}
              <span className="ml-1 opacity-70">({tag.count})</span>
            </Badge>
          ))}
        </div>

        {/* AI Analysis - Full Width with softer styling */}
        <div className="animate-slide-in-left">
          <Card className="border border-border/30 bg-card/80 backdrop-blur-sm shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-5">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">AI分析</span>
                {generatedAt && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(generatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>

              {aiSummary ? (
                structuredSummary ? (
                  <StructuredAISummaryView summary={structuredSummary} topArticlesById={topArticlesById} />
                ) : legacySummary ? (
                  <LegacyAISummaryView summary={legacySummary} />
                ) : (
                  <div className="flex-1">
                    <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-line">
                      {aiSummary}
                    </p>
                  </div>
                )
              ) : (
                <div className="flex-1 flex items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    AI分析は準備中です
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
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
      `}</style>
    </section>
  );
}
