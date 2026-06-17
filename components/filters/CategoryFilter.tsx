'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui-v2/badge-v2';
import { Layers, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Category {
  value: string | null;
  label: string;
  count: number;
}

interface CategoryStats {
  categories: Category[];
  total: number;
}

export default function CategoryFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [optimisticCategory, setOptimisticCategory] = useState<string>('all');
  const currentCategory = searchParams.get('category') || 'all';

  // 楽観的更新のための値
  const displayCategory = isPending ? optimisticCategory : currentCategory;

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/articles/categories');
      if (response.ok) {
        const data: CategoryStats = await response.json();
        setCategories(data.categories);
      }
    } catch (_error) {
      // エラーは無視（UIは空のカテゴリリストを表示）
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async callback updates state on mount
    fetchCategories();
  }, [fetchCategories]);

  const handleCategoryChange = (value: string) => {
    // 即座に楽観的更新
    setOptimisticCategory(value);

    // ルーティングをトランジション内で実行
    startTransition(() => {
      const params = new URLSearchParams(searchParams);

      if (value === 'all') {
        params.delete('category');
      } else {
        params.set('category', value);
      }

      // Reset to page 1 when changing category
      params.delete('page');

      router.push(`/?${params.toString()}`);
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 rounded bg-[var(--tt-color-surface-hover)]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Layers className="h-4 w-4" />
        <span>カテゴリ</span>
      </div>

      <Select
        value={displayCategory}
        onValueChange={handleCategoryChange}
        disabled={isPending}
      >
        <SelectTrigger
          className={cn('w-full transition-all', isPending && 'opacity-70')}
        >
          <div className="flex w-full items-center justify-between">
            <SelectValue placeholder="カテゴリを選択" />
            {isPending && <Loader2 className="ml-2 h-3 w-3 animate-spin" />}
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <div className="flex w-full items-center justify-between">
              <span>すべて</span>
              <Badge variant="secondary" className="ml-2">
                {categories.reduce((sum, cat) => sum + cat.count, 0)}
              </Badge>
            </div>
          </SelectItem>

          {categories.map((category) => (
            <SelectItem
              key={category.value || 'uncategorized'}
              value={category.value || 'uncategorized'}
            >
              <div className="flex w-full items-center justify-between">
                <span>{category.label}</span>
                <Badge variant="secondary" className="ml-2">
                  {category.count}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
