/**
 * Category Preference Dialog Component
 *
 * Modal dialog for selecting interest categories and filtering period.
 * Users can select multiple categories to personalize their article feed.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { CategoryCard, CategoryCardSkeleton } from './category-card';
import { PeriodSelector } from './period-selector';
import type {
  InterestCategoryWithCount,
  PeriodPreset,
} from '@/lib/personalization/types';

// =============================================================================
// Props
// =============================================================================

export interface CategoryPreferenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: InterestCategoryWithCount[];
  selectedCategories: string[];
  selectedPeriod: PeriodPreset;
  onSave: (categories: string[], period: PeriodPreset) => Promise<void>;
  isLoading?: boolean;
  isSaving?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function CategoryPreferenceDialog({
  open,
  onOpenChange,
  categories,
  selectedCategories,
  selectedPeriod,
  onSave,
  isLoading = false,
  isSaving = false,
}: CategoryPreferenceDialogProps) {
  // Local state for editing (committed on save)
  const [tempCategories, setTempCategories] =
    useState<string[]>(selectedCategories);
  const [tempPeriod, setTempPeriod] = useState<PeriodPreset>(selectedPeriod);
  const [hasEdited, setHasEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset local state when dialog opens or parent state changes
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset edit tracking on dialog open
      setHasEdited(false);
      setSaveError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || hasEdited) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync temp state on dialog open
    setTempCategories(selectedCategories);
    setTempPeriod(selectedPeriod);
  }, [open, selectedCategories, selectedPeriod, hasEdited]);

  // Toggle category selection
  const handleToggle = (categoryId: string) => {
    setHasEdited(true);
    setTempCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Select all categories
  const handleSelectAll = () => {
    setHasEdited(true);
    setTempCategories(categories.map((c) => c.id));
  };

  // Clear all selections
  const handleClear = () => {
    setHasEdited(true);
    setTempCategories([]);
  };

  const handlePeriodChange = (period: PeriodPreset) => {
    setHasEdited(true);
    setTempPeriod(period);
  };

  // Save changes
  const handleSave = async () => {
    setSaveError(null);
    try {
      await onSave(tempCategories, tempPeriod);
      setHasEdited(false);
      onOpenChange(false);
    } catch {
      setSaveError('保存に失敗しました。もう一度お試しください。');
    }
  };

  // Cancel and reset
  const handleCancel = () => {
    setTempCategories(selectedCategories);
    setTempPeriod(selectedPeriod);
    setHasEdited(false);
    setSaveError(null);
    onOpenChange(false);
  };

  const hasChanges =
    JSON.stringify([...tempCategories].sort()) !==
      JSON.stringify([...selectedCategories].sort()) ||
    tempPeriod !== selectedPeriod;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !isSaving && handleCancel()}
    >
      <DialogContent
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 p-0 sm:max-w-xl"
        onInteractOutside={(e) => isSaving && e.preventDefault()}
        onEscapeKeyDown={(e) => isSaving && e.preventDefault()}
      >
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>興味のある分野を選択</DialogTitle>
          <DialogDescription>
            選択した分野の記事を優先的に表示します
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          {/* Selection count and bulk actions */}
          <div className="flex items-center justify-between border-b py-3 text-sm">
            <span aria-live="polite" aria-atomic="true">
              {tempCategories.length} / {categories.length} 選択中
            </span>
            <div className="space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={isLoading || isSaving}
              >
                すべて選択
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={isLoading || isSaving || tempCategories.length === 0}
              >
                クリア
              </Button>
            </div>
          </div>

          {/* Category Grid */}
          <fieldset className="py-4" aria-label="技術分野を選択">
            <legend className="sr-only">興味のある技術分野</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="group">
              {isLoading
                ? // Skeleton loading state
                  Array.from({ length: 7 }).map((_, i) => (
                    <CategoryCardSkeleton key={i} />
                  ))
                : categories.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      selected={tempCategories.includes(category.id)}
                      onToggle={handleToggle}
                      disabled={isSaving}
                    />
                  ))}
            </div>
          </fieldset>

          {/* Period Selector */}
          <div className="border-t py-4">
            <PeriodSelector
              value={tempPeriod}
              onChange={handlePeriodChange}
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        {/* Save Error */}
        {saveError && (
          <div className="px-6">
            <Alert variant="destructive">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Footer Actions */}
        <DialogFooter className="flex-col-reverse gap-2 border-t p-6 pt-4 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving || !hasChanges}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
