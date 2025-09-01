'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
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
  };

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
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Layers className="h-4 w-4" />
        <span>カテゴリ</span>
      </div>
      
      <Select value={displayCategory} onValueChange={handleCategoryChange} disabled={isPending}>
        <SelectTrigger className={cn(
          "w-full transition-all",
          isPending && "opacity-70"
        )}>
          <div className="flex items-center justify-between w-full">
            <SelectValue placeholder="カテゴリを選択" />
            {isPending && (
              <Loader2 className="h-3 w-3 animate-spin ml-2" />
            )}
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center justify-between w-full">
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
              <div className="flex items-center justify-between w-full">
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