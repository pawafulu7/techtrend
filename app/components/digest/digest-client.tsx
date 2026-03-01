'use client';

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, Settings, CheckCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DigestSection } from './digest-section';
import { DigestSkeleton } from './digest-skeleton';
import { CategoryPreferenceDialog } from '@/app/components/personalization/category-preference-dialog';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import type {
  DigestResponse,
  DigestPeriod,
} from '@/lib/services/digest-service';
import type { PeriodPreset } from '@/lib/personalization/types';

export function DigestClient() {
  const [period, setPeriod] = useState<DigestPeriod>('daily');
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const {
    categories,
    selectedCategories,
    periodMonths,
    isLoading: prefLoading,
    isUpdating,
    updatePreferencesAsync,
  } = usePersonalizationPreferences('digest');

  const fetchDigest = useCallback(
    async (p: DigestPeriod, signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      setDigest(null);
      try {
        const res = await fetch(`/api/digest?period=${p}`, { signal });
        if (!res.ok) {
          if (res.status === 401) {
            setError('ログインが必要です');
            return;
          }
          throw new Error(`Failed to fetch digest: ${res.status}`);
        }
        const data: DigestResponse = await res.json();
        setDigest(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return; // Aborted, ignore
        }
        setError(
          err instanceof Error
            ? err.message
            : 'ダイジェストの取得に失敗しました'
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchDigest(period, controller.signal);
    return () => controller.abort();
  }, [period, fetchDigest, fetchTrigger]);

  const handleSavePreferences = useCallback(
    async (categoryIds: string[], selectedPeriod: PeriodPreset) => {
      await updatePreferencesAsync({
        categoryIds,
        filterEnabled: categoryIds.length > 0,
        periodMonths: selectedPeriod,
      });
      // Trigger re-fetch via useEffect (proper AbortController management)
      setFetchTrigger((prev) => prev + 1);
    },
    [updatePreferencesAsync]
  );

  const handlePeriodChange = (value: string) => {
    if (value === 'daily' || value === 'weekly') {
      setPeriod(value);
    }
  };

  // Check if all sections are empty
  const allEmpty =
    digest?.hasPreferences &&
    digest.sections.every((s) => s.articles.length === 0);

  return (
    <div className="px-4 py-3 lg:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 pb-4">
        <Newspaper className="text-primary h-5 w-5" aria-hidden="true" />
        <h1 className="text-foreground text-lg font-semibold">ダイジェスト</h1>
        {digest?.hasPreferences && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="ml-auto"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">カテゴリ設定</span>
          </Button>
        )}
      </header>

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={handlePeriodChange} className="mb-6">
        <TabsList>
          <TabsTrigger value="daily">今日</TabsTrigger>
          <TabsTrigger value="weekly">今週</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Error State */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && <DigestSkeleton />}

      {/* No Preferences State */}
      {!isLoading && digest && !digest.hasPreferences && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <Settings
              className="text-muted-foreground h-8 w-8"
              aria-hidden="true"
            />
          </div>
          <p className="text-foreground mb-2 text-lg font-medium">
            カテゴリを設定してください
          </p>
          <p className="text-muted-foreground mb-6 max-w-md text-center text-sm">
            興味のあるカテゴリを選択すると、あなた向けのダイジェストが生成されます
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            カテゴリを設定する
          </Button>
        </div>
      )}

      {/* All Read State */}
      {!isLoading && allEmpty && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <CheckCircle className="text-primary h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-foreground mb-2 text-lg font-medium">
            全て読了しました
          </p>
          <p className="text-muted-foreground text-center text-sm">
            {period === 'daily' ? '今日' : '今週'}
            の新着記事はすべて確認済みです
          </p>
        </div>
      )}

      {/* Digest Sections */}
      {!isLoading && digest?.hasPreferences && !allEmpty && (
        <div className="space-y-8">
          {digest.sections.map((section) => (
            <DigestSection key={section.type} section={section} />
          ))}
        </div>
      )}

      {/* Category Preference Dialog */}
      <CategoryPreferenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        selectedPeriod={periodMonths}
        onSave={handleSavePreferences}
        isLoading={prefLoading}
        isSaving={isUpdating}
        showPeriodSelector={false}
      />
    </div>
  );
}
