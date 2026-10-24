'use client';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui-v2/button-v2';
import { PageHeader } from '@/components/ui-v2/page-header';
import { TrendLineChart, SourcePieChart } from '@/app/components/trends';
import { TrendNavigationCards } from '@/app/components/trends/overview/TrendNavigationCards';
import { DataFreshness } from '@/app/components/common/data-freshness';
import { TrendingKeywordsSection } from './keyword-sections';
import type {
  TrendingKeyword,
  TrendAnalysis,
  SourceDataItem,
} from './trends-data';

// null はサーバーでの取得の失敗。空配列（該当なし）とは別に表示する（issue #701）
interface TrendsContentProps {
  initialKeywords: TrendingKeyword[] | null;
  /** 急上昇のタグの総数（一覧は上位 20 件に打ち切る） */
  trendingTotal: number | null;
  /** 急上昇キーワードの集計時刻（issue #707） */
  keywordsAggregatedAt?: string | null;
  initialAnalysis: TrendAnalysis | null;
  initialSourceData: SourceDataItem[] | null;
  /** ソース別記事分布の集計時刻 */
  sourceAggregatedAt?: string | null;
}

export function TrendsContent({
  initialKeywords,
  trendingTotal,
  keywordsAggregatedAt,
  initialAnalysis,
  initialSourceData,
  sourceAggregatedAt,
}: TrendsContentProps) {
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(
    initialAnalysis
  );
  const [selectedDays, setSelectedDays] = useState(7);

  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  // 分析の取得に失敗した期間。失敗表示はその期間を表示しているときだけ出す（別の期間を
  // 読み込んでいる間に、前の期間の失敗を見せないため）
  const [failedDays, setFailedDays] = useState<number | null>(
    initialAnalysis === null ? 7 : null
  );
  // 期間の切り替えと再試行の取得を1本にまとめ、古い応答で上書きしないようにする
  const analysisControllerRef = useRef<AbortController | null>(null);
  // 最後に成功した7日の分析（サーバー描画か、クライアントでの取り直し）。7日に戻したときに
  // これを使い、取り直して成功した分析をサーバーの失敗（null）で捨てない
  const sevenDayAnalysisRef = useRef(initialAnalysis);
  const selectedDaysRef = useRef(selectedDays);
  useEffect(() => {
    selectedDaysRef.current = selectedDays;
  }, [selectedDays]);
  // 他セクションの再試行（router.refresh）でも initialAnalysis が届き直す。期間切り替えの
  // effect とは分け、新しい分析が届いたときだけ反映する（14日・30日表示中は取り直さない）
  useEffect(() => {
    if (initialAnalysis === null) return;
    sevenDayAnalysisRef.current = initialAnalysis;
    if (selectedDaysRef.current === 7) {
      analysisControllerRef.current?.abort();
      setLoadingAnalysis(false);
      setFailedDays(null);
      setTrendAnalysis(initialAnalysis);
    }
  }, [initialAnalysis]);

  // サーバーで取得したセクション（急上昇・新着タグ・ソース分布）の再試行
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const refreshServerData = useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router]);

  const fetchTrendAnalysis = useCallback(
    async (days: number, signal?: AbortSignal) => {
      try {
        setLoadingAnalysis(true);
        const response = await fetch(`/api/trends/analysis?days=${days}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // JSON を読む間に期間が切り替わっていたら、古い期間の応答で上書きしない
        if (signal?.aborted) return;
        if (!data || data.error || !Array.isArray(data.topTags)) {
          throw new Error('Invalid trend analysis response');
        }
        if (days === 7) sevenDayAnalysisRef.current = data;
        setFailedDays(null);
        setTrendAnalysis(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to fetch trend analysis:', error);
        }
        setFailedDays(days);
        setTrendAnalysis(null);
      } finally {
        if (!signal?.aborted) {
          setLoadingAnalysis(false);
        }
      }
    },
    []
  );

  const startAnalysisFetch = useCallback(
    (days: number) => {
      analysisControllerRef.current?.abort();
      const controller = new AbortController();
      analysisControllerRef.current = controller;
      void fetchTrendAnalysis(days, controller.signal);
    },
    [fetchTrendAnalysis]
  );

  useEffect(() => {
    // 初回レンダリング時（selectedDays===7）はサーバー取得済みデータを使用
    if (selectedDays === 7) {
      analysisControllerRef.current?.abort();
      // 30日→7日切替時、進行中の fetch を abort した直後は finally が
      // signal.aborted 経由でローディング解除をスキップするため、ここで明示的に false に戻す。
      // 続けて最後に成功した7日の分析に戻す（無ければ失敗のまま）。
      const sevenDay = sevenDayAnalysisRef.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingAnalysis(false);
      setFailedDays(sevenDay === null ? 7 : null);
      setTrendAnalysis(sevenDay);
      // 7日表示中に始めた分析の再試行を、離脱時に止める
      return () => analysisControllerRef.current?.abort();
    }

    // デバウンス中から読み込み中にする（前の期間の内容や失敗を見せない）
    setLoadingAnalysis(true);
    const timeoutId = setTimeout(() => {
      startAnalysisFetch(selectedDays);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      analysisControllerRef.current?.abort();
    };
  }, [selectedDays, startAnalysisFetch]);

  // 表示中の期間で失敗している。失敗後の再試行中もスケルトンに戻さず、失敗表示（再試行中…）を残す
  const analysisFailed = trendAnalysis === null && failedDays === selectedDays;
  const retryAnalysis = useCallback(() => {
    startAnalysisFetch(selectedDays);
  }, [startAnalysisFetch, selectedDays]);

  const chartData = useMemo(
    () => ({
      timeline: trendAnalysis?.timeline || [],
      topTags: trendAnalysis?.topTags?.slice(0, 10).map((t) => t.name) || [],
    }),
    [trendAnalysis]
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      {/* 間隔は親の space-y-8 が持つので、見出しの下の余白は消す */}
      <PageHeader icon={BarChart3} title="トレンド概要" className="pb-0" />

      <TrendingKeywordsSection
        keywords={initialKeywords}
        total={trendingTotal}
        aggregatedAt={keywordsAggregatedAt}
        onRetry={refreshServerData}
        retrying={isRefreshing}
      />

      {/* Sub-page Navigation。人気タグ・新着タグはタグ分析（/tags）にまとめ、ここからはリンクにする（Issue #709） */}
      <section>
        <h2 className="text-foreground text-h2 mb-3">詳細レポート</h2>
        <TrendNavigationCards />
      </section>

      {/* Analysis Section */}
      <section className="border-t pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-foreground text-h2">分析</h2>
          <div
            className="flex gap-1.5"
            role="group"
            aria-label="分析期間の選択"
          >
            {[7, 14, 30].map((days) => (
              <Button
                key={days}
                variant={selectedDays === days ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDays(days)}
                aria-pressed={selectedDays === days}
                className="h-7 px-3 text-xs"
              >
                {days}日間
              </Button>
            ))}
          </div>
        </div>
        {trendAnalysis && !loadingAnalysis && (
          <DataFreshness
            at={trendAnalysis.period?.to}
            period={`直近${trendAnalysis.period?.days ?? selectedDays}日`}
            className="-mt-2 mb-4"
          />
        )}

        <div className="space-y-6">
          {/* Trend Line Chart */}
          <TrendLineChart
            data={chartData.timeline}
            tags={chartData.topTags}
            loading={loadingAnalysis && !analysisFailed}
            error={analysisFailed}
            onRetry={retryAnalysis}
            retrying={loadingAnalysis}
          />

          <SourcePieChart
            data={initialSourceData}
            note={
              <DataFreshness
                at={sourceAggregatedAt}
                period="全期間"
                className="-mt-2 mb-2"
              />
            }
            loading={false}
            onRetry={refreshServerData}
            retrying={isRefreshing}
          />
        </div>
      </section>
    </div>
  );
}
