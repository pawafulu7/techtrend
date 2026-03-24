'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import {
  CATEGORY_OPTIONS,
  type AdminSource,
  type QualityStatus,
} from '../_types';

const QUALITY_STATUS_OPTIONS = [
  { value: 'missing_summary', label: '要約なし' },
  { value: 'missing_category', label: 'カテゴリなし' },
  { value: 'missing_content', label: '本文なし' },
  { value: 'low_quality', label: '低品質(score<30)' },
  { value: 'has_error', label: 'エラーあり' },
  { value: 'skipped', label: 'スキップ' },
] as const;

interface ArticlesFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  sourceId: string;
  onSourceIdChange: (sourceId: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  qualityStatus: QualityStatus | '';
  onQualityStatusChange: (status: QualityStatus | '') => void;
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
  sources,
}: ArticlesFiltersProps) {
  const [inputValue, setInputValue] = useState(query);
  const [isComposing, setIsComposing] = useState(false);
  const debouncedValue = useDebounce(inputValue, 300);

  // 外部からqueryが変わった場合（クリア等）に同期
  useEffect(() => {
    if (query !== inputValue) {
      setInputValue(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // デバウンス後に親へ通知（IME入力中は発火しない）
  useEffect(() => {
    if (isComposing) return;
    if (debouncedValue !== query) {
      onQueryChange(debouncedValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue, isComposing]);

  const handleClear = () => {
    setInputValue('');
    onQueryChange('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          type="text"
          placeholder="キーワードで検索..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            const value = (e.target as HTMLInputElement).value;
            if (value !== query) {
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

      <Select value={sourceId || ''} onValueChange={onSourceIdChange}>
        <SelectTrigger className="h-9 w-40">
          <SelectValue placeholder="全てのソース" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">全て</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={category || ''} onValueChange={onCategoryChange}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="全てのカテゴリ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">全て</SelectItem>
          {CATEGORY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={qualityStatus || ''} onValueChange={onQualityStatusChange}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="全ての品質状態" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">全て</SelectItem>
          {QUALITY_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
