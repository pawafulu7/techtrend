'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/hooks/use-debounce';

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('search') || '');
  const debouncedQuery = useDebounce(query, 300);

  const handleSearch = useCallback((searchQuery: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (searchQuery) {
      params.set('search', searchQuery);
      params.set('page', '1'); // 検索時は1ページ目に戻る
    } else {
      params.delete('search');
    }
    
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    if (debouncedQuery !== searchParams.get('search')) {
      handleSearch(debouncedQuery);
    }
  }, [debouncedQuery, handleSearch, searchParams]);

  const handleClear = () => {
    setQuery('');
    handleSearch('');
  };

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder="キーワードで記事を検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="pl-9 pr-9 h-8 text-sm bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-white/30 focus:bg-white dark:focus:bg-gray-900 focus:border-white/50"
      />
      {query && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}