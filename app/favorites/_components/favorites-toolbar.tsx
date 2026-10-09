'use client';

import { Search, ArrowUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SortOption } from '../_types';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'favoritedAt-desc', label: '保存日（新しい順）' },
  { value: 'favoritedAt-asc', label: '保存日（古い順）' },
  { value: 'publishedAt-desc', label: '公開日（新しい順）' },
];

interface FavoritesToolbarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortOption: SortOption;
  onSortOptionChange: (option: SortOption) => void;
}

/**
 * お気に入りの見出し行の右に置く、検索と並び替え。
 * favorites-content.tsx から切り出した（400行を超えていたため。Issue #700 の PR で分割）
 */
export function FavoritesToolbar({
  searchQuery,
  onSearchQueryChange,
  sortOption,
  onSortOptionChange,
}: FavoritesToolbarProps) {
  return (
    <>
      <div className="relative">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="検索..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="h-9 w-48 pl-10 lg:w-64"
          aria-label="お気に入り記事を検索"
        />
      </div>
      <Select
        value={sortOption}
        onValueChange={(value) => {
          const option = SORT_OPTIONS.find((o) => o.value === value);
          if (option) {
            onSortOptionChange(option.value);
          }
        }}
      >
        <SelectTrigger className="h-9 w-44" aria-label="並び替え">
          <ArrowUpDown className="mr-2 h-4 w-4" aria-hidden="true" />
          <SelectValue placeholder="並び替え" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
