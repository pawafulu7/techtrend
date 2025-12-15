'use client';

import { useState, useEffect } from 'react';
import { DailyTrendHero, TopArticleList, CategoryDistribution } from '@/app/components/trends/daily';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TrendReportData {
  periodType: string;
  periodStart: string;
  periodEnd: string;
  articleCount: number;
  topArticles: Array<{
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
  categories: Array<{
    name: string;
    count: number;
    percentage: number;
    topArticle?: {
      id: string;
      title: string;
      translatedTitle?: string | null;
    } | null;
  }>;
  tags: Array<{
    name: string;
    count: number;
    percentage: number;
  }>;
  aiSummary?: string;
  aiModel?: string;
  generatedAt?: string;
}

export default function DailyTrendPage() {
  const [report, setReport] = useState<TrendReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // デフォルト: 前日
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  });

  const fetchReport = async (date: Date) => {
    setLoading(true);
    setError(null);

    try {
      const dateStr = date.toISOString().split('T')[0];
      const response = await fetch(`/api/trends/daily?date=${dateStr}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('この日のトレンドレポートはまだ生成されていません');
        } else {
          setError('データの取得に失敗しました');
        }
        setReport(null);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setReport(data.data);
      } else {
        setError(data.error || 'データの取得に失敗しました');
      }
    } catch (_err) {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(selectedDate);
  }, [selectedDate]);

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);

    // 未来の日付は選択不可
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate >= today) return;

    setSelectedDate(newDate);
  };

  const isNextDisabled = () => {
    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tomorrow >= today;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Date navigation */}
      <div className="sticky top-14 z-40 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPreviousDay}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              前日
            </Button>

            <div className="text-center">
              <p className="font-semibold">
                {selectedDate.toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextDay}
              disabled={isNextDisabled()}
              className="gap-2"
            >
              翌日
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchReport(selectedDate)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                再試行
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="container mx-auto px-4 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-64 bg-muted rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-96 bg-muted rounded-xl" />
              <div className="h-96 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      ) : report ? (
        <>
          {/* Hero section with AI summary */}
          <DailyTrendHero
            aiSummary={report.aiSummary}
            articleCount={report.articleCount}
            periodStart={report.periodStart}
            periodEnd={report.periodEnd}
            generatedAt={report.generatedAt}
            topTags={report.tags}
          />

          {/* Content sections */}
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Top articles - 7 columns */}
              <div className="lg:col-span-7">
                <TopArticleList articles={report.topArticles} />
              </div>

              {/* Category distribution - 5 columns */}
              <div className="lg:col-span-5">
                <CategoryDistribution categories={report.categories} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
