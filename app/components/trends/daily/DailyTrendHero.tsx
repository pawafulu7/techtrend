'use client';

import { Sparkles, Calendar, TrendingUp, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DailyTrendHeroProps {
  aiSummary?: string;
  articleCount: number;
  periodStart: string;
  periodEnd: string;
  generatedAt?: string;
  topTags?: { name: string; count: number }[];
}

export function DailyTrendHero({
  aiSummary,
  articleCount,
  periodStart,
  generatedAt,
  topTags = []
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

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
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
                  <div className="flex-1">
                    <p className="text-lg leading-relaxed text-foreground/90">
                      {aiSummary}
                    </p>
                  </div>
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
