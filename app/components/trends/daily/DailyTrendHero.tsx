'use client';

import Link from 'next/link';
import { Sparkles, Calendar, TrendingUp, FileText, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { extractFirstJsonObject, TrendAiSummaryV1Schema, type TrendAiSummaryV1 } from '@/lib/types/trend-ai-summary';

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

function parseStructuredAISummary(text: string): TrendAiSummaryV1 | null {
  const json = extractFirstJsonObject(text);
  const parsed = TrendAiSummaryV1Schema.safeParse(json);
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

function StructuredAISummaryView({
  summary,
  topArticlesById,
}: {
  summary: TrendAiSummaryV1;
  topArticlesById: Map<string, TopArticle>;
}) {
  return (
    <div className="flex-1">
      <div className="text-xl font-semibold leading-snug text-foreground">
        {summary.headline}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7">
          <div className="text-xs font-semibold text-muted-foreground tracking-wide">
            Key Topics
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
            Key Numbers
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
            Action Points
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
            Key Topics
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
            Action Points
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

      <div className="relative container mx-auto px-4 py-12">
        {/* Header with navigation */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Daily Trend
                </h1>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(periodStart)}
                </p>
              </div>
            </div>

            {/* Date navigation */}
            <div className="flex items-center gap-2">
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

        {/* Main content - asymmetric layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* AI Summary - takes 7 columns */}
          <div className="lg:col-span-7 animate-slide-in-left">
            <Card className="h-full border-0 bg-gradient-to-br from-card via-card to-primary/5 shadow-lg">
              <CardContent className="p-6 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold text-primary">AI Analysis</span>
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
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-muted-foreground">
                      AI分析は準備中です
                    </p>
                  </div>
                )}

                {generatedAt && (
                  <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
                    Generated: {new Date(generatedAt).toLocaleString('ja-JP')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats & Tags - takes 5 columns */}
          <div className="lg:col-span-5 space-y-6 animate-slide-in-right">
            {/* Article count stat */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-primary to-primary/80">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-primary-foreground/80 text-sm font-medium">
                      Total Articles
                    </p>
                    <p className="text-4xl font-bold text-primary-foreground mt-1">
                      {articleCount.toLocaleString()}
                    </p>
                  </div>
                  <FileText className="h-12 w-12 text-primary-foreground/20" />
                </div>
              </CardContent>
            </Card>

            {/* Top tags */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">
                  Trending Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {topTags.slice(0, 8).map((tag, index) => (
                    <Badge
                      key={tag.name}
                      variant="secondary"
                      className={cn(
                        "px-3 py-1 text-sm transition-all hover:scale-105 animate-fade-in",
                        index === 0 && "bg-primary text-primary-foreground hover:bg-primary/90",
                        index === 1 && "bg-primary/80 text-primary-foreground hover:bg-primary/70",
                        index === 2 && "bg-primary/60 text-primary-foreground hover:bg-primary/50"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {tag.name}
                      <span className="ml-1 opacity-70">({tag.count})</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
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
