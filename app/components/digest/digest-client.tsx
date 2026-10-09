'use client';

import { useState, useMemo } from 'react';
import { Newspaper, Settings, CheckCircle, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Button } from '@/components/ui-v2/button-v2';
import { ErrorState } from '@/components/ui-v2/error-state';
import { PageHeader } from '@/components/ui-v2/page-header';
import { DigestSection } from './digest-section';
import { CategoryPreferenceDialog } from '@/app/components/personalization/category-preference-dialog';
import { useUpdatePreferences } from '@/lib/hooks/use-personalization-preferences';
import { DigestFetchError, useDigest } from '@/lib/hooks/use-digest';
import { loginWithCallback } from '@/lib/routes/auth';
import type { DigestPeriod } from '@/lib/services/digest-service';
import type { PeriodPreset } from '@/lib/personalization/types';

export function DigestClient() {
  const [period, setPeriod] = useState<DigestPeriod>('daily');
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    data: digest,
    isLoading,
    error,
    refetch,
    isFetching,
    hasFailedSinceMount,
  } = useDigest(period);
  const isUnauthorized =
    error instanceof DigestFetchError && error.status === 401;
  // React Query は data の無いクエリを再取得すると pending に戻す。読み込み中の表示は初回だけにし、
  // 失敗後の再試行中は失敗表示（再試行中…）を残す（issue #701）
  const showInitialLoading = isLoading && !hasFailedSinceMount;
  const failedWithoutData =
    !digest && !isUnauthorized && (!!error || hasFailedSinceMount);

  const { mutateAsync: updatePreferencesAsync, isPending: isUpdating } =
    useUpdatePreferences('digest');

  const categories = useMemo(
    () => digest?.categories ?? [],
    [digest?.categories]
  );
  const selectedCategories = useMemo(
    () => digest?.selectedCategories ?? [],
    [digest?.selectedCategories]
  );

  const handleSavePreferences = async (
    categoryIds: string[],
    _selectedPeriod: PeriodPreset
  ) => {
    await updatePreferencesAsync({
      categoryIds,
      filterEnabled: categoryIds.length > 0,
    });
  };

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
    <div className="mx-auto w-full max-w-7xl px-4 py-3">
      <PageHeader
        icon={Newspaper}
        title="ダイジェスト"
        actions={
          digest?.hasPreferences &&
          !isUnauthorized && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">カテゴリ設定</span>
            </Button>
          )
        }
      />

      {/* Period Tabs */}
      <Tabs value={period} onValueChange={handlePeriodChange} className="mb-6">
        <TabsList>
          <TabsTrigger value="daily">今日</TabsTrigger>
          <TabsTrigger value="weekly">今週</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Error State: 生の error.message は出さない（issue #701） */}
      {error && isUnauthorized && (
        <ErrorState
          size="block"
          title="ログインの有効期限が切れました"
          description="ダイジェストを表示するには、もう一度ログインしてください。"
        >
          <Button asChild className="mt-6 min-h-[44px]">
            <Link href={loginWithCallback('/digest')}>ログインする</Link>
          </Button>
        </ErrorState>
      )}
      {failedWithoutData && (
        <ErrorState
          size="block"
          title="ダイジェストを読み込めませんでした"
          description="時間をおいて再試行してください。"
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      )}
      {/* 再取得に失敗したが前回の内容がある: 古いデータとして表示を続ける。
          401 のときは前回の内容も隠し、ログインの案内だけを出す */}
      {error && !isUnauthorized && digest && (
        <ErrorState
          title="最新のダイジェストを読み込めませんでした"
          description="前回読み込んだ内容を表示しています。"
          onRetry={() => refetch()}
          retrying={isFetching}
          className="mb-6 rounded-lg border"
        />
      )}

      {/* Loading State */}
      {showInitialLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="border-primary/20 border-t-primary h-24 w-24 animate-spin rounded-full border-4" />
              <Loader2 className="text-primary absolute inset-0 m-auto h-10 w-10 animate-pulse" />
            </div>
            <div className="space-y-2 text-center">
              <p className="text-foreground text-lg font-semibold">
                読み込み中
              </p>
              <div className="flex items-center justify-center space-x-1">
                <span
                  className="bg-primary h-2 w-2 animate-bounce rounded-full"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="bg-primary h-2 w-2 animate-bounce rounded-full"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="bg-primary h-2 w-2 animate-bounce rounded-full"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Preferences State */}
      {!isLoading && !isUnauthorized && digest && !digest.hasPreferences && (
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
      {!isLoading && !isUnauthorized && allEmpty && (
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
      {!isLoading && !isUnauthorized && digest?.hasPreferences && !allEmpty && (
        <div className="space-y-8">
          {digest.sections.map((section) => (
            <DigestSection key={section.type} section={section} />
          ))}
        </div>
      )}

      {/* Category Preference Dialog */}
      {/* 401 のときはログインの案内だけを出すので、カテゴリ設定も開かせない */}
      {!isUnauthorized && (
        <CategoryPreferenceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          categories={categories}
          selectedCategories={selectedCategories}
          selectedPeriod={12} // Digest uses fixed 12-month period; replace with user preference when period selector is enabled
          onSave={handleSavePreferences}
          isLoading={isLoading}
          isSaving={isUpdating}
          showPeriodSelector={false}
        />
      )}
    </div>
  );
}
