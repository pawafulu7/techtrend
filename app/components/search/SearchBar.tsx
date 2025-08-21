'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface SearchSuggestion {
  type: 'history' | 'suggestion';
  text: string;
}

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const debouncedQuery = useDebounce(query, 300);

  // 検索履歴の取得
  const getSearchHistory = useCallback(() => {
    const history = localStorage.getItem('searchHistory');
    if (history) {
      try {
        return JSON.parse(history) as string[];
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  // 検索履歴の保存
  const saveToHistory = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    const history = getSearchHistory();
    const updatedHistory = [
      searchQuery,
      ...history.filter(h => h !== searchQuery)
    ].slice(0, 10); // 最新10件を保持
    
    localStorage.setItem('searchHistory', JSON.stringify(updatedHistory));
  }, [getSearchHistory]);

  // サジェスチョンの生成
  useEffect(() => {
    if (debouncedQuery) {
      const history = getSearchHistory()
        .filter(h => h.toLowerCase().includes(debouncedQuery.toLowerCase()))
        .map(text => ({ type: 'history' as const, text }));
      
      setSuggestions(history);
    } else {
      // クエリが空の場合は履歴を全て表示
      const history = getSearchHistory()
        .slice(0, 5)
        .map(text => ({ type: 'history' as const, text }));
      
      setSuggestions(history);
    }
  }, [debouncedQuery, getSearchHistory]);

  // 検索実行
  const handleSearch = useCallback((searchQuery?: string) => {
    const finalQuery = searchQuery || query;
    if (!finalQuery.trim() && !searchQuery) return;
    
    setIsSearching(true);
    saveToHistory(finalQuery);
    
    // 検索パラメータを構築
    const params = new URLSearchParams(searchParams);
    if (finalQuery) {
      params.set('search', finalQuery);
      params.set('page', '1'); // 検索時は1ページ目に戻る
    } else {
      params.delete('search');
    }
    
    // ホームページへ遷移（検索パラメータ付き）
    router.push(`/?${params.toString()}`);
    setShowSuggestions(false);
    
    setTimeout(() => setIsSearching(false), 500);
  }, [query, searchParams, router, saveToHistory]);

  // キーボードイベント
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  // クリア
  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
    
    // URLパラメータから検索クエリを削除
    const params = new URLSearchParams(searchParams);
    params.delete('search');
    params.delete('q'); // 念のため古いパラメータも削除
    
    // ホームページへ遷移（検索パラメータなし）
    router.push(`/?${params.toString()}`);
  };

  // 外部クリックでサジェスチョンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // グローバルショートカット (Cmd/Ctrl + K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowSuggestions(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div ref={searchRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        
        <Input
          ref={inputRef}
          type="search"
          placeholder="記事を検索... (Cmd+K)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          className="pl-9 pr-20"
          autoComplete="off"
          spellCheck={false}
        />
        
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          <Button
            type="button"
            size="sm"
            onClick={() => handleSearch()}
            disabled={isSearching || !query.trim()}
            className="h-7"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              '検索'
            )}
          </Button>
        </div>
      </div>
      
      {/* サジェスチョン */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50">
          <div className="py-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm"
                onClick={() => {
                  setQuery(suggestion.text);
                  handleSearch(suggestion.text);
                }}
              >
                {suggestion.type === 'history' ? (
                  <Search className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Search className="h-3 w-3" />
                )}
                <span className="flex-1">{suggestion.text}</span>
                {suggestion.type === 'history' && (
                  <span className="text-xs text-muted-foreground">履歴</span>
                )}
              </button>
            ))}
          </div>
          
          {getSearchHistory().length > 0 && (
            <div className="border-t px-3 py-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  localStorage.removeItem('searchHistory');
                  setSuggestions([]);
                }}
              >
                検索履歴をクリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}