'use client';

import { useState, useCallback } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';

export function Search() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('search') || '');

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    const params = new URLSearchParams(searchParams.toString());
    if (query) {
      params.set('search', query);
    } else {
      params.delete('search');
    }
    params.set('page', '1'); // Reset to first page on new search
    
    router.push(`/?${params.toString()}`);
  }, [query, router, searchParams]);

  const handleClear = useCallback(() => {
    setQuery('');
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.set('page', '1');
    router.push(`/?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-sm">
      <div className="relative flex-1">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="記事を検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <Button type="submit" size="default">
        検索
      </Button>
      {query && (
        <Button type="button" variant="outline" size="default" onClick={handleClear}>
          クリア
        </Button>
      )}
    </form>
  );
}