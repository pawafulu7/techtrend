'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { DiffSummaryCard } from '@/app/components/diff-summary';
import { DiffChange } from '@/lib/ai/extraction/extraction-schemas';
import {
  getISOWeek,
  getPreviousISOWeek,
  getNextISOWeek,
} from '@/lib/ai/diff-summary';
import Link from 'next/link';

interface DiffSummaryData {
  categorySlug: string;
  categoryName: string;
  currentPeriod: string;
  baselinePeriod: string;
  changes: DiffChange[];
  unchanged: string[];
  modelVersion: string;
  promptVersion: string;
  generatedAt: string;
}

interface DiffSummaryResponse {
  success: boolean;
  week: string;
  previousWeek: string;
  data: DiffSummaryData[];
  meta: {
    totalCategories: number;
    summarizedCategories: number;
  };
}

export default function DiffSummaryPage() {
  const [data, setData] = useState<DiffSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(getISOWeek(new Date()));

  const currentWeek = getISOWeek(new Date());
  const canGoNext = selectedWeek < currentWeek;

  useEffect(() => {
    fetchData(selectedWeek);
  }, [selectedWeek]);

  const fetchData = async (week: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/diff-summary?week=${week}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousWeek = () => {
    setSelectedWeek(getPreviousISOWeek(selectedWeek));
  };

  const handleNextWeek = () => {
    if (canGoNext) {
      setSelectedWeek(getNextISOWeek(selectedWeek));
    }
  };

  // Calculate summary stats
  const totalChanges =
    data?.data.reduce((sum, d) => sum + d.changes.length, 0) || 0;
  const newTopics =
    data?.data.reduce(
      (sum, d) => sum + d.changes.filter((c) => c.type === 'new').length,
      0
    ) || 0;
  const trendingTopics =
    data?.data.reduce(
      (sum, d) => sum + d.changes.filter((c) => c.type === 'trending').length,
      0
    ) || 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Link
            href="/trends"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            トレンド分析
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm">週間変化レポート</span>
        </div>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold">
          <GitCompare className="h-8 w-8" />
          週間トピック変化
        </h1>
        <p className="text-muted-foreground">
          カテゴリ別の技術トピックの週間変化を分析
        </p>
      </div>

      {/* Week Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousWeek}
            disabled={loading}
            aria-label="前週へ移動"
          >
            <ChevronLeft className="h-4 w-4" />
            前週
          </Button>
          <div className="bg-muted rounded-md px-4 py-2">
            <span className="font-semibold">{selectedWeek}</span>
            {selectedWeek === currentWeek && (
              <Badge variant="secondary" className="ml-2">
                今週
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            disabled={loading || !canGoNext}
            aria-label="次週へ移動"
          >
            次週
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {data && !loading && (
          <div className="flex items-center gap-4 text-sm">
            <div className="text-muted-foreground">
              <span className="text-foreground font-semibold">
                {totalChanges}
              </span>{' '}
              件の変化
            </div>
            <div className="text-green-600 dark:text-green-400">
              <span className="font-semibold">{newTopics}</span> 新規
            </div>
            <div className="text-orange-600 dark:text-orange-400">
              <span className="font-semibold">{trendingTopics}</span> 急上昇
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 py-8">
            <AlertCircle className="text-destructive h-8 w-8" />
            <div>
              <p className="font-semibold">データの取得に失敗しました</p>
              <p className="text-muted-foreground text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : data && data.data.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.data.map((summary) => (
            <DiffSummaryCard
              key={summary.categorySlug}
              categorySlug={summary.categorySlug}
              categoryName={summary.categoryName}
              currentPeriod={summary.currentPeriod}
              baselinePeriod={summary.baselinePeriod}
              changes={summary.changes}
              unchanged={summary.unchanged}
              generatedAt={summary.generatedAt}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>データがありません</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {selectedWeek} のデータはまだ生成されていません。
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              週間レポートは毎週月曜日に自動生成されます。
            </p>
          </CardContent>
        </Card>
      )}

      {/* Meta info */}
      {data && (
        <div className="text-muted-foreground mt-8 text-center text-xs">
          {data.meta.summarizedCategories} / {data.meta.totalCategories}{' '}
          カテゴリの分析が完了
        </div>
      )}
    </div>
  );
}
