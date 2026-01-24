'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SocialPostSource } from '@/lib/social-post';

interface GeneratePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type GenerateSource = Exclude<SocialPostSource, 'MANUAL'>;

const SOURCE_OPTIONS: Array<{
  value: GenerateSource;
  label: string;
  description: string;
}> = [
  {
    value: 'ARTICLE',
    label: '記事',
    description: '技術記事から投稿を生成',
  },
  {
    value: 'DAILY_TREND',
    label: 'Daily Trend',
    description: '日次トレンドサマリーから投稿を生成',
  },
  {
    value: 'DIFF_SUMMARY',
    label: 'Diff Summary',
    description: '週次変化分析から投稿を生成',
  },
];

export function GeneratePostDialog({
  open,
  onOpenChange,
  onComplete,
}: GeneratePostDialogProps) {
  const [source, setSource] = useState<GenerateSource>('ARTICLE');
  const [sourceIds, setSourceIds] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!sourceIds.trim()) {
      setError('ソースIDを入力してください');
      return;
    }

    const ids = sourceIds
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) {
      setError('有効なIDがありません');
      return;
    }

    if (ids.length > 5) {
      setError('一度に生成できるのは5件までです');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/social-posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, sourceIds: ids }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '生成に失敗しました');
      }

      const data = await res.json();
      alert(`${data.count}件の投稿を生成しました`);
      setSourceIds('');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSourceIds('');
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>投稿を生成</DialogTitle>
          <DialogDescription>
            ソースを選択してAIで投稿コンテンツを生成します
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source">ソースタイプ</Label>
            <Select
              value={source}
              onValueChange={(value) => setSource(value as GenerateSource)}
              disabled={isLoading}
            >
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {opt.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sourceIds">
              ソースID（カンマ区切りで複数指定可、最大5件）
            </Label>
            <Input
              id="sourceIds"
              value={sourceIds}
              onChange={(e) => setSourceIds(e.target.value)}
              placeholder="例: clxxx1, clxxx2"
              disabled={isLoading}
            />
            <p className="text-muted-foreground text-xs">
              {source === 'ARTICLE' && '記事IDを入力してください'}
              {source === 'DAILY_TREND' && 'TrendReport IDを入力してください'}
              {source === 'DIFF_SUMMARY' && 'DiffSummary IDを入力してください'}
            </p>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? '生成中...' : '生成する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
