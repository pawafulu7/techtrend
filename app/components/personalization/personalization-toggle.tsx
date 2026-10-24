/**
 * Personalization Toggle Component
 *
 * ホームのツールバーのパーソナライズのボタン。押すと分野の設定のダイアログが開き、
 * 絞り込みの状態（絞り込み中・オフ）は見た目と読み上げの文字で伝える。
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui-v2/button-v2';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryPreferenceDialog } from './category-preference-dialog';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import type { PeriodPreset } from '@/lib/personalization/types';
import {
  TOOLBAR_CONTROL,
  TOOLBAR_OUTLINE,
} from '@/app/components/common/toolbar-styles';

// =============================================================================
// Props
// =============================================================================

interface PersonalizationToggleProps {
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function PersonalizationToggle({
  className,
}: PersonalizationToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    categories,
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoading,
    updatePreferencesAsync,
    isUpdating,
    hasPreferences,
  } = usePersonalizationPreferences();

  // Handle toggle press - open dialog
  const handleToggleClick = () => {
    setDialogOpen(true);
  };

  // Handle save from dialog
  const handleSave = async (
    categoryIds: string[],
    period: PeriodPreset,
    homeFilterEnabled: boolean
  ) => {
    // 分野は変えたときだけ送る。スイッチや期間だけを変えたときに、開いたときの分野で
    // 別の画面（ダイジェスト）で変えた分野を戻さないため
    const categoriesChanged =
      categoryIds.length !== selectedCategories.length ||
      categoryIds.some((id) => !selectedCategories.includes(id));
    await updatePreferencesAsync({
      ...(categoriesChanged && { categoryIds }),
      filterEnabled: homeFilterEnabled && categoryIds.length > 0,
      periodMonths: period,
    });
  };

  const active = filterEnabled && hasPreferences;

  // ツールバーのボタン。押すと設定のダイアログが開くので、切り替えの部品ではなく普通のボタンにする。
  // ほかのツールバーのボタンと同じ枠付きで出し、絞り込み中は藍の淡い塗りと分野の数で示す
  // （並び順の「選ばれている」塗りつぶしと見分けるため、塗りつぶしにはしない）
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggleClick}
        aria-haspopup="dialog"
        className={cn(
          TOOLBAR_CONTROL,
          'gap-1.5 px-3 whitespace-nowrap',
          active
            ? 'border-(--tt-color-primary-border) bg-(--tt-color-primary-bg) text-(--tt-color-primary) hover:border-(--tt-color-primary) hover:bg-(--tt-color-primary-bg)'
            : TOOLBAR_OUTLINE,
          className
        )}
        data-testid="personalization-toggle"
      >
        <Sparkles className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        {/* 狭い幅ではアイコンだけを見せ、読み上げ用の名前は残す */}
        <span className="sr-only sm:not-sr-only">パーソナライズ</span>
        {hasPreferences && (
          <span
            className={cn(
              'readout rounded-full px-1.5 py-0.5 text-xs',
              active
                ? 'bg-(--tt-color-primary) text-(--tt-color-on-primary)'
                : 'bg-(--tt-color-surface-hover) text-(--tt-color-text-muted)'
            )}
          >
            <span className="sr-only">選んだ分野 </span>
            {selectedCategories.length}
          </span>
        )}
        <span className="sr-only">
          {active ? '（絞り込み中）' : '（絞り込みオフ）'}
        </span>
      </Button>

      <CategoryPreferenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        selectedPeriod={periodMonths}
        // 初めて分野を選ぶときは、選んだらホームを絞り込む（今までと同じ）。
        // ダイジェストで分野を選んだだけの人はオフから始まる
        homeFilterEnabled={hasPreferences ? filterEnabled : true}
        onSave={handleSave}
        isLoading={isLoading}
        isSaving={isUpdating}
      />
    </>
  );
}

// =============================================================================
// Export for barrel file
// =============================================================================

export { CategoryPreferenceDialog } from './category-preference-dialog';
export { CategoryCard, CategoryCardSkeleton } from './category-card';
export { PeriodSelector } from './period-selector';
