'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/hooks/use-debounce';

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URLパラメータから初期値を取得
  const [query, setQuery] = useState(() => {
    return searchParams.get('search') || '';
  });
  
  const [isComposing, setIsComposing] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const isInternalUpdate = useRef(false);
  
  // URLパラメータが外部から変更された場合のみ状態を更新
  useEffect(() => {
    const newSearch = searchParams.get('search');
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    setQuery(newSearch || '');
  }, [searchParams]);

  const handleSearch = useCallback(async (searchQuery: string) => {
    isInternalUpdate.current = true;
    
    const params = new URLSearchParams(searchParams.toString());
    
    if (searchQuery) {
      params.set('search', searchQuery);
      params.set('page', '1');
    } else {
      params.delete('search');
      params.delete('page');
    }
    
    router.push(`/?${params.toString()}`);
    
    // Cookieに保存（将来の拡張用、現在は使用しない）
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: searchQuery || undefined }),
      });
    } catch {
      // Silent fail
    }
  }, [router, searchParams]);

  // デバウンスされた検索実行
  useEffect(() => {
    if (isComposing) return;
    
    const currentUrlSearch = searchParams.get('search') || '';
    if (debouncedQuery !== currentUrlSearch) {
      handleSearch(debouncedQuery);
    }
  }, [debouncedQuery, isComposing, handleSearch, searchParams]);

  const handleClear = () => {
    isInternalUpdate.current = true;
    setQuery('');
    
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.delete('page');
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="relative" style={{ width: '24rem' }}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
      <Input
        type="text"
        placeholder="キーワードで記事を検索..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isComposing) {
            e.preventDefault();
            handleSearch(query);
          }
        }}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        className="pl-9 pr-9 h-8 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600"
        data-testid="search-box-input"
      />
      {query && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          data-testid="search-clear"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}