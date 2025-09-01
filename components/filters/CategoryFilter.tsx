'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';

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
  const currentCategory = searchParams.get('category') || 'all';

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
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    
    if (value === 'all') {
      params.delete('category');
    } else {
      params.set('category', value);
    }
    
    // Reset to page 1 when changing category
    params.delete('page');
    
    router.push(`/?${params.toString()}`);
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
      
      <Select value={currentCategory} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="カテゴリを選択" />
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