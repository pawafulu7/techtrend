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
  onSave: (categories: string[], period: PeriodPreset) => void;
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
  const [tempCategories, setTempCategories] = useState<string[]>(selectedCategories);
  const [tempPeriod, setTempPeriod] = useState<PeriodPreset>(selectedPeriod);
  const [hasEdited, setHasEdited] = useState(false);

  // Reset local state when dialog opens or parent state changes
  useEffect(() => {
    if (open) {
      setHasEdited(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || hasEdited) return;
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
  const handleSave = () => {
    onSave(tempCategories, tempPeriod);
    setHasEdited(false);
    onOpenChange(false);
  };

  // Cancel and reset
  const handleCancel = () => {
    setTempCategories(selectedCategories);
    setTempPeriod(selectedPeriod);
    setHasEdited(false);
    onOpenChange(false);
  };

  const hasChanges =
    JSON.stringify([...tempCategories].sort()) !==
      JSON.stringify([...selectedCategories].sort()) ||
    tempPeriod !== selectedPeriod;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent
        className="w-full max-w-lg sm:max-w-xl p-0 gap-0 flex flex-col max-h-[90vh]"
      >
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>
            興味のある分野を選択
          </DialogTitle>
          <DialogDescription>
            選択した分野の記事を優先的に表示します
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          {/* Selection count and bulk actions */}
          <div className="flex items-center justify-between text-sm py-3 border-b">
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
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="group"
            >
              {isLoading ? (
                // Skeleton loading state
                Array.from({ length: 7 }).map((_, i) => (
                  <CategoryCardSkeleton key={i} />
                ))
              ) : (
                categories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    selected={tempCategories.includes(category.id)}
                    onToggle={handleToggle}
                    disabled={isSaving}
                  />
                ))
              )}
            </div>
          </fieldset>

          {/* Period Selector */}
          <div className="py-4 border-t">
            <PeriodSelector
              value={tempPeriod}
              onChange={handlePeriodChange}
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-6 pt-4 border-t flex-col-reverse sm:flex-row gap-2">
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
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
