/**
 * Personalization Toggle Component
 *
 * Toggle button for enabling/disabling personalized article filtering.
 * Opens the category preference dialog when clicked.
 */

'use client';

import { useState } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CategoryPreferenceDialog } from './category-preference-dialog';
import { usePersonalizationPreferences } from '@/lib/hooks/use-personalization-preferences';
import type { PeriodPreset } from '@/lib/personalization/types';

// =============================================================================
// Props
// =============================================================================

interface PersonalizationToggleProps {
  className?: string;
  variant?: 'toggle' | 'button';
}

// =============================================================================
// Component
// =============================================================================

export function PersonalizationToggle({
  className,
  variant = 'toggle',
}: PersonalizationToggleProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    categories,
    selectedCategories,
    filterEnabled,
    periodMonths,
    isLoading,
    updatePreferences,
    isUpdating,
    hasPreferences,
  } = usePersonalizationPreferences();

  // Handle toggle press - open dialog
  const handleToggleClick = () => {
    setDialogOpen(true);
  };

  // Handle save from dialog
  const handleSave = (categoryIds: string[], period: PeriodPreset) => {
    updatePreferences({
      categoryIds,
      filterEnabled: categoryIds.length > 0,
      periodMonths: period === 0 ? undefined : period,
    });
  };

  // Render as Toggle (default)
  if (variant === 'toggle') {
    return (
      <>
        <Toggle
          pressed={filterEnabled && hasPreferences}
          onPressedChange={handleToggleClick}
          onClick={handleToggleClick}
          aria-label="パーソナライズ設定"
          className={cn(
            'gap-1.5 h-9 px-3 whitespace-nowrap',
            'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            className
          )}
          data-testid="personalization-toggle"
        >
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline text-sm">パーソナライズ</span>
          {hasPreferences && (
            <span className="text-xs opacity-70">({selectedCategories.length})</span>
          )}
        </Toggle>

        <CategoryPreferenceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          categories={categories}
          selectedCategories={selectedCategories}
          selectedPeriod={periodMonths}
          onSave={handleSave}
          isLoading={isLoading}
          isSaving={isUpdating}
        />
      </>
    );
  }

  // Render as Button
  return (
    <>
      <Button
        variant={filterEnabled && hasPreferences ? 'default' : 'outline'}
        size="sm"
        onClick={handleToggleClick}
        className={cn('gap-1.5 whitespace-nowrap', className)}
        data-testid="personalization-button"
      >
        <Settings className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">パーソナライズ</span>
        {hasPreferences && (
          <span className="text-xs opacity-70">({selectedCategories.length})</span>
        )}
      </Button>

      <CategoryPreferenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        selectedCategories={selectedCategories}
        selectedPeriod={periodMonths}
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
