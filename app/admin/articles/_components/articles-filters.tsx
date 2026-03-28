'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui-v2/button-v2';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { Label } from '@/components/ui/label';
import {
  CATEGORY_OPTIONS,
  QUALITY_STATUS_VALUES,
  type AdminSource,
  type QualityStatus,
  type VisibilityFilter,
} from '../_types';

const QUALITY_STATUS_LABELS: Record<QualityStatus, string> = {
  missing_summary: '要約なし',
  missing_category: 'カテゴリなし',
  missing_content: '本文なし',
  low_quality: '低品質(score<30)',
  has_error: 'エラーあり',
  skipped: 'スキップ',
};

interface ArticlesFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  sourceId: string;
  onSourceIdChange: (sourceId: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  qualityStatus: QualityStatus | '';
  onQualityStatusChange: (status: QualityStatus | '') => void;
  visibility: VisibilityFilter;
  onVisibilityChange: (visibility: VisibilityFilter) => void;
  sources: AdminSource[];
}

export function ArticlesFilters({
  query,
  onQueryChange,
  sourceId,
  onSourceIdChange,
  category,
  onCategoryChange,
  qualityStatus,
  onQualityStatusChange,
  visibility,
  onVisibilityChange,
  sources,
}: ArticlesFiltersProps) {
  const [inputValue, setInputValue] = useState(query);
  const [isComposing, setIsComposing] = useState(false);
  const debouncedValue = useDebounce(inputValue, 300);
  const lastSentRef = useRef(query);

  // 外部からqueryが変わった場合（クリア等）に同期
  // inputValueは意図的に依存配列から除外（含めるとinput→state→effectの無限ループ）
  useEffect(() => {
    if (query !== inputValue) {
      setInputValue(query);
    }
    // 親からの外部更新時に重複送信しないよう同期
    lastSentRef.current = query;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // デバウンス後に親へ通知（IME入力中は発火しない）
  useEffect(() => {
    if (isComposing) return;
    if (debouncedValue !== lastSentRef.current) {
      lastSentRef.current = debouncedValue;
      onQueryChange(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue, isComposing]);

  const handleClear = () => {
    setInputValue('');
    lastSentRef.current = '';
    onQueryChange('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Label htmlFor="admin-article-search" className="sr-only">
          記事をキーワードで検索
        </Label>
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          id="admin-article-search"
          type="text"
          placeholder="キーワードで検索..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            const value = (e.target as HTMLInputElement).value;
            if (value !== lastSentRef.current) {
              lastSentRef.current = value;
              onQueryChange(value);
            }
          }}
          className="h-9 w-60 pr-8 pl-9"
        />
        {inputValue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 p-0"
            aria-label="検索をクリア"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Select
        value={sourceId || 'all'}
        onValueChange={(v) => onSourceIdChange(v === 'all' ? '' : v)}
      >
        <SelectTrigger className="h-9 w-40">
          <SelectValue placeholder="全てのソース" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全て</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={category || 'all'}
        onValueChange={(v) => onCategoryChange(v === 'all' ? '' : v)}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="全てのカテゴリ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全て</SelectItem>
          {CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={qualityStatus || 'all'}
        onValueChange={(v) =>
          onQualityStatusChange(v === 'all' ? '' : (v as QualityStatus))
        }
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="全ての品質状態" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全て</SelectItem>
          {QUALITY_STATUS_VALUES.map((v) => (
            <SelectItem key={v} value={v}>
              {QUALITY_STATUS_LABELS[v]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={visibility}
        onValueChange={(v) => onVisibilityChange(v as VisibilityFilter)}
      >
        <SelectTrigger className="h-9 w-36">
          <SelectValue placeholder="表示状態" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全て</SelectItem>
          <SelectItem value="visible">表示のみ</SelectItem>
          <SelectItem value="hidden">非表示のみ</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
