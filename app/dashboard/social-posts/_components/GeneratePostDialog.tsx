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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type GenerationType = 'article' | 'opinion';

interface GeneratePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const GENERATION_TYPES: Record<
  GenerationType,
  { label: string; description: string; endpoint: string }
> = {
  article: {
    label: '記事ベース',
    description: '人気度・注目度を考慮して、最適な記事から投稿を自動生成します',
    endpoint: '/api/admin/social-posts/generate',
  },
  opinion: {
    label: '感想・意見',
    description:
      '最近のトレンドを分析し、個人的な感想・気づきスタイルの投稿を生成します',
    endpoint: '/api/admin/social-posts/generate-opinion',
  },
};

export function GeneratePostDialog({
  open,
  onOpenChange,
  onComplete,
}: GeneratePostDialogProps) {
  const [generationType, setGenerationType] =
    useState<GenerationType>('article');
  const [count, setCount] = useState('3');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentType = GENERATION_TYPES[generationType];

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(currentType.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parseInt(count, 10) }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '生成に失敗しました');
      }

      const data = await res.json();

      if (data.count === 0) {
        const message =
          generationType === 'article'
            ? '生成可能な記事が見つかりませんでした'
            : 'トレンドデータが不足しています';
        setError(message);
        return;
      }

      alert(`${data.count}件の投稿を生成しました`);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>投稿を自動生成</DialogTitle>
          <DialogDescription>{currentType.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>生成タイプ</Label>
            <RadioGroup
              value={generationType}
              onValueChange={(v) => setGenerationType(v as GenerationType)}
              disabled={isLoading}
              className="flex gap-4"
            >
              {(Object.keys(GENERATION_TYPES) as GenerationType[]).map(
                (type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <RadioGroupItem value={type} id={`type-${type}`} />
                    <Label htmlFor={`type-${type}`} className="cursor-pointer">
                      {GENERATION_TYPES[type].label}
                    </Label>
                  </div>
                )
              )}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="count">生成件数</Label>
            <Select value={count} onValueChange={setCount} disabled={isLoading}>
              <SelectTrigger id="count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}件
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {generationType === 'article'
                ? '過去24時間の人気記事から自動選定されます'
                : '過去3日間のトレンドを分析して生成します'}
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
