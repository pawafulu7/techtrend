'use client';

import { useState, useEffect } from 'react';
import { DailyTrendHero, TopArticleList, CategoryDistribution } from '@/app/components/trends/daily';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';
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

interface ApiResponse {
  success: boolean;
  data?: TrendReportData;
  navigation?: {
    prevDate: string | null;
    nextDate: string | null;
  };
  error?: string;
  latestAvailableDate?: string | null;
}

export default function DailyTrendPage() {
  const [report, setReport] = useState<TrendReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestAvailableDate, setLatestAvailableDate] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<{
    prevDate: string | null;
    nextDate: string | null;
  }>({ prevDate: null, nextDate: null });

  // 初回ロード時は最新レポートを取得するため、日付指定なし
  const [requestedDate, setRequestedDate] = useState<string | null>(null);

  const fetchReport = async (dateStr?: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = dateStr
        ? `/api/trends/daily?date=${dateStr}`
        : '/api/trends/daily';
      const response = await fetch(url);
      const data: ApiResponse = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setLatestAvailableDate(data.latestAvailableDate || null);
          setError('この日のトレンドレポートはまだ生成されていません');
        } else {
          setError('データの取得に失敗しました');
        }
        setReport(null);
        setNavigation({ prevDate: null, nextDate: null });
        return;
      }

      if (data.success && data.data) {
        setReport(data.data);
        setNavigation(data.navigation || { prevDate: null, nextDate: null });
        setLatestAvailableDate(null);
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
    fetchReport(requestedDate || undefined);
  }, [requestedDate]);

  const goToPreviousDay = () => {
    if (navigation.prevDate) {
      setRequestedDate(navigation.prevDate);
    }
  };

  const goToNextDay = () => {
    if (navigation.nextDate) {
      setRequestedDate(navigation.nextDate);
    }
  };

  const goToLatest = () => {
    if (latestAvailableDate) {
      setRequestedDate(latestAvailableDate);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Error state */}
      {error && (
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span>{error}</span>
              <div className="flex gap-2">
                {latestAvailableDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToLatest}
                    className="gap-2"
                  >
                    最新レポートを見る
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchReport(requestedDate || undefined)}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  再試行
                </Button>
              </div>
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
          {/* Hero section with AI summary and navigation */}
          <DailyTrendHero
            aiSummary={report.aiSummary}
            articleCount={report.articleCount}
            periodStart={report.periodStart}
            periodEnd={report.periodEnd}
            generatedAt={report.generatedAt}
            topTags={report.tags}
            topArticles={report.topArticles}
            navigation={navigation}
            onPrevDay={goToPreviousDay}
            onNextDay={goToNextDay}
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
