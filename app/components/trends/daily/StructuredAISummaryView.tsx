'use client';

import {
  TrendingUp,
  CheckCircle2,
  Plus,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Badge } from '@/components/ui-v2/badge-v2';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type {
  TrendAiSummary,
  TrendAiSummaryV2,
  EvidenceArticleMap,
} from '@/lib/types/trend-ai-summary';
import { KeyTopicArticleCards, type TopArticle } from './KeyTopicArticleCards';

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
          {t.topic} {t.deltaCount}
        </Badge>
      ))}
    </div>
  );
}

interface StructuredAISummaryViewProps {
  summary: TrendAiSummary;
  topArticlesById: Map<string, TopArticle>;
  evidenceArticles: EvidenceArticleMap;
}

export function StructuredAISummaryView({
  summary,
  topArticlesById,
  evidenceArticles,
}: StructuredAISummaryViewProps) {
  if (summary.version === 'trend_ai_summary_v2') {
    return (
      <div className="flex-1 space-y-4">
        {/* Core Statement - Hero */}
        <div className="rounded-xl border-l-4 border-l-[var(--tt-color-primary)] bg-[var(--tt-color-positive-bg)] p-4 sm:p-5">
          <p className="text-foreground text-xl leading-tight font-semibold sm:text-2xl">
            {summary.core}
          </p>
          {summary.overview && (
            <p className="text-foreground/90 mt-2 text-sm leading-relaxed sm:text-base">
              {summary.overview}
            </p>
          )}
        </div>

        {/* Trend Changes Summary - Prominent */}
        {summary.trendChanges && summary.trendChanges.available && (
          <div className="rounded-xl border border-[var(--tt-color-info-border)] bg-[var(--tt-color-info-bg)] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="text-primary h-5 w-5" />
              <span className="text-foreground text-sm font-semibold">
                {summary.trendChanges.basis?.periodLabel || 'トレンド変化'}
              </span>
            </div>
            <p className="text-foreground mb-3 text-sm leading-relaxed">
              {summary.trendChanges.summary}
            </p>
            <TrendChangesBadges trendChanges={summary.trendChanges} />
          </div>
        )}

        {/* Main Content Grid: Key Topics (8cols) + Sidebar (4cols) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Key Topics - Main Area */}
          <div className="space-y-4 lg:col-span-8">
            <div className="text-muted-foreground text-xs font-semibold tracking-wide">
              注目トピック
            </div>
            <div className="space-y-3">
              {summary.keyTopics.slice(0, 4).map((t) => (
                <div
                  key={t.topic}
                  className="bg-card hover:bg-accent/50 rounded-xl border border-l-4 border-l-emerald-500/40 p-3 transition-colors sm:p-4 dark:border-l-emerald-400/30"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
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
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {t.whyItMatters}
                      </p>
                    </div>
                  </div>
                  {t.evidenceArticleIds && t.evidenceArticleIds.length > 0 && (
                    <details className="border-border/50 mt-2 border-t pt-2">
                      <summary className="text-muted-foreground cursor-pointer text-xs hover:underline">
                        関連記事 {t.evidenceArticleIds.length}件
                      </summary>
                      <div className="mt-2">
                        <KeyTopicArticleCards
                          articleIds={t.evidenceArticleIds}
                          topArticlesById={topArticlesById}
                          evidenceArticles={evidenceArticles}
                        />
                      </div>
                    </details>
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
                  <div className="space-y-2">
                    {summary.actions.slice(0, 3).map((a, idx) => (
                      <div
                        key={a.action}
                        className="bg-muted/30 rounded-lg p-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground line-clamp-2 text-sm font-medium">
                              {a.action}
                            </p>
                            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                              {a.reason}
                            </p>
                            {a.articleIds.length > 0 && (
                              <div className="mt-1.5">
                                <KeyTopicArticleCards
                                  articleIds={a.articleIds.slice(0, 1)}
                                  topArticlesById={topArticlesById}
                                  evidenceArticles={evidenceArticles}
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
                  <div className="mt-2">
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
                      <div className="mt-1.5">
                        <KeyTopicArticleCards
                          articleIds={a.relatedArticleIds}
                          topArticlesById={topArticlesById}
                          evidenceArticles={evidenceArticles}
                        />
                      </div>
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
