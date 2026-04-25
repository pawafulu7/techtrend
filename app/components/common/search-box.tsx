'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui-v2/button-v2';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useDebounce } from '@/hooks/use-debounce';

export function SearchBox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync from URL params
    setQuery(newSearch || '');
  }, [searchParams]);

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      isInternalUpdate.current = true;

      const params = new URLSearchParams(searchParams.toString());

      if (searchQuery) {
        params.set('search', searchQuery);
        params.set('page', '1');
      } else {
        params.delete('search');
        params.delete('page');
      }

      // 現在のパスを維持してURLパラメータを更新
      const nextUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.push(nextUrl);

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
    },
    [router, searchParams, pathname]
  );

  // デバウンスされた検索実行
  useEffect(() => {
    if (isComposing) return;

    // デバウンス値が実際の入力値と揃うまではURL更新を行わない
    if (debouncedQuery !== query) return;

    const currentUrlSearch = searchParams.get('search') || '';
    if (debouncedQuery !== currentUrlSearch) {
      handleSearch(debouncedQuery);
    }
  }, [debouncedQuery, query, isComposing, handleSearch, searchParams]);

  const handleClear = async () => {
    isInternalUpdate.current = true;
    setQuery('');

    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    params.delete('page');

    // 現在のパスを維持してURLパラメータを更新
    const nextUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.push(nextUrl);

    // Update cookie with null to clear stored search
    try {
      await fetch('/api/filter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: null }),
      });
    } catch {
      // Silent fail
    }
  };

  return (
    <div className="flex flex-col" style={{ width: '24rem' }}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-[var(--tt-color-text-muted)]" />
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
          className="h-8 border border-[var(--tt-color-border)] bg-[var(--tt-color-surface)] pr-9 pl-9 text-sm"
          data-testid="search-box-input"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 transform p-0"
            data-testid="search-clear"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
