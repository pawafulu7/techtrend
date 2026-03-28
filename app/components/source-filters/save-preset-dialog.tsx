'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui-v2/button-v2';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface SavePresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
  isSaving: boolean;
}

export function SavePresetDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
}: SavePresetDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('プリセット名を入力してください');
      return;
    }
    if (trimmed.length > 50) {
      setError('50文字以内で入力してください');
      return;
    }

    try {
      setError('');
      await onSave(trimmed);
      setName('');
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error) {
        setError(
          err.message === 'Preset name already exists'
            ? 'この名前は既に使われています'
            : err.message
        );
      } else {
        setError('予期しないエラーが発生しました');
      }
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setError('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>プリセットを保存</DialogTitle>
          <DialogDescription>
            現在のソース選択に名前をつけて保存します
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder="プリセット名"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSaving) handleSave();
            }}
            maxLength={50}
            autoFocus
            disabled={isSaving}
          />
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
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
