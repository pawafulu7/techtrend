'use client';

import { useState } from 'react';
import { ChevronDown, Save, Trash2, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui-v2/button-v2';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSourcePresets } from '@/app/hooks/use-source-presets';
import { SavePresetDialog } from './save-preset-dialog';

interface CustomPresetDropdownProps {
  selectedSources: string[];
  onApplyPreset: (sourceIds: string[]) => void;
  allSources: Array<{ id: string; name: string }>;
  initialIsAuthenticated: boolean;
}

export function CustomPresetDropdown({
  selectedSources,
  onApplyPreset,
  allSources,
  initialIsAuthenticated,
}: CustomPresetDropdownProps) {
  const {
    presets,
    isAuthenticated,
    createPreset,
    deletePreset,
    isCreating,
    isDeleting,
  } = useSourcePresets(initialIsAuthenticated);
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  if (!isAuthenticated) return null;

  const handleApplyPreset = (sourceIds: string[]) => {
    // Filter to only currently valid sources
    const validSet = new Set(allSources.map((s) => s.id));
    const validIds = sourceIds.filter((id) => validSet.has(id));
    if (validIds.length > 0) {
      onApplyPreset(validIds);
    } else {
      toast({
        title: 'プリセットを適用できません',
        description: '保存されたソースが現在利用できません',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (name: string) => {
    if (selectedSources.length === 0) {
      throw new Error('ソースが選択されていません');
    }
    await createPreset({ name, sourceIds: selectedSources });
  };

  const handleDelete = async (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    try {
      await deletePreset(presetId);
    } catch {
      // TanStack Query側でエラー処理される
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            data-testid="custom-preset-trigger"
          >
            <Bookmark className="h-3 w-3" />
            マイプリセット
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {presets.length > 0 ? (
            <>
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  className="flex items-center justify-between"
                  onClick={() => handleApplyPreset(preset.sourceIds)}
                  data-testid={`preset-item-${preset.id}`}
                >
                  <span className="truncate">{preset.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground ml-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 [div:hover>&]:opacity-100"
                    onClick={(e) => handleDelete(e, preset.id)}
                    disabled={isDeleting}
                    aria-label={`${preset.name}を削除`}
                    data-testid={`preset-delete-${preset.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem
            onClick={() => setSaveDialogOpen(true)}
            disabled={selectedSources.length === 0}
            data-testid="preset-save-button"
          >
            <Save className="mr-2 h-4 w-4" />
            現在の選択を保存
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SavePresetDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSave}
        isSaving={isCreating}
      />
    </>
  );
}
