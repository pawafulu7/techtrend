'use client';

import { useMemo } from 'react';
import {
  Sparkles,
  Calendar,
  TrendingUp,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  parseTrendAiSummary,
  type EvidenceArticleMap,
} from '@/lib/types/trend-ai-summary';
import { StructuredAISummaryView } from './StructuredAISummaryView';

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
  evidenceArticles?: EvidenceArticleMap;
  navigation?: {
    prevDate: string | null;
    nextDate: string | null;
  };
  onPrevDay?: () => void;
  onNextDay?: () => void;
}

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
      timeZone: 'Asia/Tokyo',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '日時不明';
    return date.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
    });
  };

  const structuredSummary = useMemo(
    () => parseTrendAiSummary(aiSummary),
    [aiSummary]
  );
  const legacySummary = useMemo(
    () =>
      !structuredSummary && aiSummary ? parseLegacyAISummary(aiSummary) : null,
    [structuredSummary, aiSummary]
  );
  const topArticlesById = useMemo(
    () => new Map(topArticles.map((a) => [a.id, a] as const)),
    [topArticles]
  );

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-sky-50/50 dark:from-emerald-950/20 dark:to-sky-950/10" />
      <div className="absolute top-0 right-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.07] blur-3xl" />
      <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/2 translate-y-1/2 rounded-full bg-sky-500/[0.05] blur-3xl" />

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
        <div className="animate-fade-in mb-4 flex flex-wrap items-center gap-3">
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
          <Card className="border-border/30 bg-card border shadow-sm backdrop-blur-sm">
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-primary text-sm font-semibold">
                  AI分析
                </span>
                {generatedAt && (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatDateTime(generatedAt)}
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
