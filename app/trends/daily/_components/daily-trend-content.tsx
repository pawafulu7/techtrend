'use client';

import { useState, useCallback } from 'react';
import {
  DailyTrendHero,
  TopArticleList,
  CategoryDistribution,
} from '@/app/components/trends/daily';
import { Button } from '@/components/ui-v2/button-v2';
import {
  RefreshCw,
  AlertCircle,
  Info,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui-v2/page-header';
import type { EvidenceArticleMap } from '@/lib/types/trend-ai-summary';
import type { SerializedTrendReport, DailyTrendResponse } from './daily-data';
import { DAILY_REPORT_NOT_FOUND_ERROR } from '@/lib/constants/daily-trend';

function formatDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

function formatReportDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '日付不明';
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  });
}

const NOT_FOUND_MESSAGE = 'この日のトレンドレポートはまだ生成されていません';
const FETCH_FAILED_MESSAGE = 'データの取得に失敗しました';

// サーバーの error は英語の内部向け文言（daily-data.ts）。そのまま画面に出さない（issue #701）
function toUserMessage(response: DailyTrendResponse): string | null {
  if (response.success) return null;
  return response.error === DAILY_REPORT_NOT_FOUND_ERROR
    ? NOT_FOUND_MESSAGE
    : FETCH_FAILED_MESSAGE;
}

interface DailyTrendContentProps {
  initialData: DailyTrendResponse;
}

export function DailyTrendContent({ initialData }: DailyTrendContentProps) {
  const [report, setReport] = useState<SerializedTrendReport | null>(
    initialData.data ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(toUserMessage(initialData));
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
      // 500 の HTML などで JSON にならない応答を「ネットワークエラー」と取り違えない
      const data: DailyTrendResponse = await response
        .json()
        .catch(() => ({ success: false }));

      if (!response.ok) {
        if (response.status === 404) {
          setLatestAvailableDate(data.latestAvailableDate ?? null);
          setError(NOT_FOUND_MESSAGE);
        } else {
          setError(FETCH_FAILED_MESSAGE);
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
        setError(toUserMessage(data) ?? FETCH_FAILED_MESSAGE);
      }
    } catch (_err) {
      setError('ネットワークエラーが発生しました');
      setIsFallback(false);
      setFallbackInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToPreviousDay = useCallback(() => {
    if (navigation.prevDate) {
      setRequestedDate(navigation.prevDate);
      fetchReport(navigation.prevDate);
    }
  }, [navigation.prevDate, fetchReport]);

  const goToNextDay = useCallback(() => {
    if (navigation.nextDate) {
      setRequestedDate(navigation.nextDate);
      fetchReport(navigation.nextDate);
    }
  }, [navigation.nextDate, fetchReport]);

  const goToLatest = useCallback(() => {
    if (latestAvailableDate) {
      setRequestedDate(latestAvailableDate);
      fetchReport(latestAvailableDate);
    }
  }, [latestAvailableDate, fetchReport]);

  return (
    <div>
      {/* 見出しは読み込み中・エラー時も出す（h1 を常に1つ置く。Issue #700） */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-6">
        <PageHeader
          icon={Calendar}
          title="デイリートレンド"
          className="pb-0"
          description={
            report ? formatReportDate(report.periodStart) : undefined
          }
          actions={
            // 読み込み中もボタンを出したまま押せなくする（見出し行の高さを保つ）
            report && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousDay}
                  disabled={loading || !navigation.prevDate}
                  className="gap-1"
                  aria-label="前日のトレンドを表示"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline" aria-hidden="true">
                    前日
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextDay}
                  disabled={loading || !navigation.nextDate}
                  className="gap-1"
                  aria-label="翌日のトレンドを表示"
                >
                  <span className="hidden sm:inline" aria-hidden="true">
                    翌日
                  </span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )
          }
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-auto w-full max-w-7xl px-4 py-8">
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
        <div className="mx-auto w-full max-w-7xl px-4 py-12">
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
            <div className="mx-auto w-full max-w-7xl px-4 pt-4">
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

          {/* Hero section with AI summary */}
          <DailyTrendHero
            aiSummary={report.aiSummary}
            articleCount={report.articleCount}
            generatedAt={report.generatedAt}
            topTags={report.tags}
            topArticles={report.topArticles}
            evidenceArticles={evidenceArticles}
          />

          {/* Content sections */}
          <div className="mx-auto w-full max-w-7xl px-4 py-8">
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
