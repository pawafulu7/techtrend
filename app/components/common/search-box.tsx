'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/hooks/use-debounce';
import { getFilterPreferencesClient } from '@/lib/filter-preferences-cookie';

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => {
    // URLパラメータがない場合はCookieから復元
    const urlSearch = searchParams.get('search');
    if (urlSearch) return urlSearch;
    
    const prefs = getFilterPreferencesClient();
    return prefs.search || '';
  });
  const debouncedQuery = useDebounce(query, 300);

  const handleSearch = useCallback(async (searchQuery: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (searchQuery) {
      params.set('search', searchQuery);
      params.set('page', '1'); // 検索時は1ページ目に戻る
    } else {
      params.delete('search');
    }
    
    router.push(`/?${params.toString()}`);
    
    // Update filter preferences cookie
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: searchQuery ? searchQuery : undefined }),
      });
    } catch (error) {
      console.error('Failed to update filter preferences:', error);
    }
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
    <div className="relative" style={{ width: '24rem' }}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
      <Input
        type="text"
        placeholder="キーワードで記事を検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="pl-9 pr-9 h-8 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:bg-white dark:focus:bg-gray-900 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20"
        data-testid="search-box-input"
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