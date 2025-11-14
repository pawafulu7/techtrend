'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandInput } from '@/components/ui/command';
import type { CompanySource } from '@/lib/providers/company-source';

export interface CompanySelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: CompanySource[];
  selectedSources: string[];
  onApply: (sourceIds: string[]) => void;
}

/**
 * Company selection dialog
 * Modal for selecting company blog sources with search and bulk actions
 */
export function CompanySelectionDialog({
  open,
  onOpenChange,
  sources,
  selectedSources,
  onApply,
}: CompanySelectionDialogProps) {
  const [tempSelected, setTempSelected] = useState<string[]>(selectedSources);
  const [searchValue, setSearchValue] = useState('');

  // Sync tempSelected when dialog opens
  useEffect(() => {
    if (open) {
      setTempSelected(selectedSources);
      setSearchValue('');
    }
  }, [open, selectedSources]);

  // Filter sources by search query
  const filteredSources = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return sources;

    return sources.filter((source) =>
      source.name.toLowerCase().includes(keyword)
    );
  }, [sources, searchValue]);

  // Sort sources alphabetically
  const sortedSources = useMemo(() => {
    return [...filteredSources].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredSources]);

  // Toggle source selection
  const toggle = (id: string) => {
    setTempSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  // Select all filtered sources
  const selectAll = () => {
    setTempSelected(sortedSources.map((s) => s.id));
  };

  // Clear all selections
  const clear = () => {
    setTempSelected([]);
  };

  // Handle close with intent (apply or cancel)
  const handleClose = (intent: 'apply' | 'cancel') => {
    if (intent === 'apply') {
      onApply(tempSelected);
    } else {
      // Cancel: reset to original selection
      setTempSelected(selectedSources);
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && handleClose('cancel')}
    >
      <DialogContent
        aria-labelledby="company-dialog-title"
        aria-describedby="company-dialog-description"
        className="max-w-4xl max-h-[80vh] flex flex-col"
      >
        <DialogHeader>
          <DialogTitle id="company-dialog-title">
            企業ブログを選択
          </DialogTitle>
          <DialogDescription id="company-dialog-description">
            フィルタリングする企業を選択してください
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <Command className="border rounded-md" aria-label="企業検索">
          <CommandInput
            value={searchValue}
            onValueChange={setSearchValue}
            placeholder="企業名で検索..."
          />
        </Command>

        {/* Selection count and bulk actions */}
        <div className="flex items-center justify-between text-sm py-2">
          <span aria-live="polite" aria-atomic="true">
            選択中: {tempSelected.length} / {sources.length}
          </span>
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              すべて選択
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              クリア
            </Button>
          </div>
        </div>

        {/* Company grid */}
        <div
          role="list"
          aria-label="企業一覧"
          className="flex-1 overflow-y-auto"
        >
          {sortedSources.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              該当する企業が見つかりませんでした
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {sortedSources.map((source) => (
                <label
                  key={source.id}
                  htmlFor={`checkbox-${source.id}`}
                  className="flex items-center space-x-2 rounded border p-2 hover:bg-accent cursor-pointer transition-colors"
                  role="listitem"
                >
                  <Checkbox
                    id={`checkbox-${source.id}`}
                    checked={tempSelected.includes(source.id)}
                    onCheckedChange={() => toggle(source.id)}
                  />
                  <span className="text-sm flex-1">{source.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose('cancel')}>
            キャンセル
          </Button>
          <Button onClick={() => handleClose('apply')}>適用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
