'use client';

import { useState, useCallback } from 'react';
import {
  DailyTrendHero,
  TopArticleList,
  CategoryDistribution,
} from '@/app/components/trends/daily';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import type { TrendReportData, DailyTrendResponse } from './daily-data';

function formatDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

interface DailyTrendContentProps {
  initialData: DailyTrendResponse;
}

export function DailyTrendContent({ initialData }: DailyTrendContentProps) {
  const [report, setReport] = useState<TrendReportData | null>(
    initialData.data ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initialData.success ? null : (initialData.error ?? null)
  );
  const [latestAvailableDate, setLatestAvailableDate] = useState<string | null>(
    initialData.latestAvailableDate ?? null
  );
  const [navigation, setNavigation] = useState<{
    prevDate: string | null;
    nextDate: string | null;
  }>(initialData.navigation ?? { prevDate: null, nextDate: null });
  const [evidenceArticles, setEvidenceArticles] = useState<EvidenceArticleMap>(
    initialData.evidenceArticles ?? {}
  );
  const [isFallback, setIsFallback] = useState(initialData.isFallback === true);
  const [fallbackInfo, setFallbackInfo] = useState<{
    requestedDate: string;
    actualDate: string;
  } | null>(
    initialData.isFallback &&
      initialData.requestedDate &&
      initialData.actualDate
      ? {
          requestedDate: initialData.requestedDate,
          actualDate: initialData.actualDate,
        }
      : null
  );

  const [requestedDate, setRequestedDate] = useState<string | null>(null);

  const fetchReport = useCallback(async (dateStr?: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = dateStr
        ? `/api/trends/daily?date=${dateStr}`
        : '/api/trends/daily';
      const response = await fetch(url);
      const data: DailyTrendResponse = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setLatestAvailableDate(data.latestAvailableDate ?? null);
          setError('この日のトレンドレポートはまだ生成されていません');
        } else {
          setError('データの取得に失敗しました');
        }
        setReport(null);
        setNavigation({ prevDate: null, nextDate: null });
        setIsFallback(false);
        setFallbackInfo(null);
        return;
      }

      if (data.success && data.data) {
        setReport(data.data);
        setNavigation(data.navigation ?? { prevDate: null, nextDate: null });
        setLatestAvailableDate(null);
        setEvidenceArticles(data.evidenceArticles ?? {});

        if (data.isFallback && data.requestedDate && data.actualDate) {
          setIsFallback(true);
          setFallbackInfo({
            requestedDate: data.requestedDate,
            actualDate: data.actualDate,
          });
        } else {
          setIsFallback(false);
          setFallbackInfo(null);
        }
      } else {
        setError(data.error ?? 'データの取得に失敗しました');
      }
    } catch (_err) {
      setError('ネットワークエラーが発生しました');
      setIsFallback(false);
      setFallbackInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToPreviousDay = () => {
    if (navigation.prevDate) {
      setRequestedDate(navigation.prevDate);
      fetchReport(navigation.prevDate);
    }
  };

  const goToNextDay = () => {
    if (navigation.nextDate) {
      setRequestedDate(navigation.nextDate);
      fetchReport(navigation.nextDate);
    }
  };

  const goToLatest = () => {
    if (latestAvailableDate) {
      setRequestedDate(latestAvailableDate);
      fetchReport(latestAvailableDate);
    }
  };

  return (
    <div>
      {/* Error state */}
      {error && (
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
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
                  onClick={() => fetchReport(requestedDate ?? undefined)}
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
            <div className="bg-muted h-64 rounded-xl" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="bg-muted h-96 rounded-xl" />
              <div className="bg-muted h-96 rounded-xl" />
            </div>
          </div>
        </div>
      ) : report ? (
        <>
          {/* Fallback info banner */}
          {isFallback && fallbackInfo && (
            <div className="container mx-auto px-4 pt-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {formatDateJP(fallbackInfo.requestedDate)}
                  のレポートは未生成のため、最新の
                  {formatDateJP(fallbackInfo.actualDate)}
                  のレポートを表示しています。
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Hero section with AI summary and navigation */}
          <DailyTrendHero
            aiSummary={report.aiSummary}
            articleCount={report.articleCount}
            periodStart={String(report.periodStart)}
            generatedAt={
              report.generatedAt ? String(report.generatedAt) : undefined
            }
            topTags={report.tags}
            topArticles={report.topArticles}
            navigation={navigation}
            onPrevDay={goToPreviousDay}
            onNextDay={goToNextDay}
            evidenceArticles={evidenceArticles}
          />

          {/* Content sections */}
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
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
