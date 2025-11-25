'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode, KeyboardEvent } from 'react';
import { Search, X, Loader2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSearchHistory } from '@/lib/hooks/useSearchHistory';

interface AgentSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  initialQuery?: string;
  onPrefillQuery?: (callback: (query: string) => void) => void;
  /** Expose focus method to parent */
  onFocusRef?: (focusFn: () => void) => void;
  badgeLabel?: string;
  badgeIcon?: ReactNode;
  helperText?: string;
  placeholder?: string;
  submitLabel?: string;
  loadingLabel?: string;
  shortcutHint?: ReactNode | null;
  historyEnabled?: boolean;
  historyLabel?: string;
  inputLabel?: string;
  /** Number of conversation turns (for multi-turn UI) */
  conversationTurns?: number;
}

export function AgentSearchBar({
  onSearch,
  isLoading = false,
  disabled = false,
  initialQuery = '',
  onPrefillQuery,
  onFocusRef,
  badgeLabel = 'AI検索',
  badgeIcon,
  helperText = '自然言語で記事を検索できます',
  placeholder = '例: terraformについての記事をおすすめ5件教えて',
  submitLabel = '検索',
  loadingLabel = '検索中',
  shortcutHint,
  historyEnabled = true,
  historyLabel = '最近の検索',
  inputLabel = 'AI検索クエリ入力',
  conversationTurns = 0,
}: AgentSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { getSearchHistory, saveToHistory } = useSearchHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const skipNextFocusRef = useRef(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setShowSuggestions(true);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = () => {
    if (!query.trim()) return;
    if (historyEnabled) {
      saveToHistory(query);
    }
    onSearch(query);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  // Shared logic for applying query from external sources (history, sample chips)
  const applyQueryFromExternal = useCallback((text: string) => {
    setQuery(text);
    skipNextFocusRef.current = true;
    inputRef.current?.focus();
  }, []);

  // Expose prefill handler to parent
  useEffect(() => {
    if (onPrefillQuery) {
      onPrefillQuery(applyQueryFromExternal);
    }
  }, [onPrefillQuery, applyQueryFromExternal]);

  // Expose focus method to parent for post-search focus restoration
  useEffect(() => {
    if (onFocusRef) {
      onFocusRef(() => {
        inputRef.current?.focus();
      });
    }
  }, [onFocusRef]);

  const suggestions = historyEnabled ? getSearchHistory().slice(0, 5) : [];

  return (
    <div ref={searchRef} className="relative w-full max-w-3xl mx-auto">
      {(badgeLabel || helperText || conversationTurns > 0) && (
        <div className="flex items-center gap-2 mb-2">
          {badgeLabel && (
            <Badge variant="secondary" className="text-xs">
              {badgeIcon ?? <Sparkles className="h-3 w-3 mr-1" />}
              {badgeLabel}
            </Badge>
          )}
          {conversationTurns > 0 && (
            <Badge
              variant="outline"
              className="text-xs"
              data-testid="conversation-turns-badge"
            >
              会話: {conversationTurns}ターン
            </Badge>
          )}
          {helperText && <span className="text-xs text-muted-foreground">{helperText}</span>}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />

        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (skipNextFocusRef.current) {
              skipNextFocusRef.current = false;
              return;
            }
            if (historyEnabled) {
              setShowSuggestions(true);
            }
          }}
          className="pl-10 pr-24 py-6 text-base bg-card border-2 border-border shadow-sm focus:border-primary focus:shadow-md transition-all duration-200"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled || isLoading}
          aria-label={inputLabel}
          data-testid="agent-search-input"
          aria-autocomplete="list"
          aria-controls="search-history-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && !isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 w-8 p-0"
              aria-label="クリア"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleSearch}
            disabled={disabled || isLoading || !query.trim()}
            className="h-8"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>

      {historyEnabled && showSuggestions && suggestions.length > 0 && (
        <div
          id="search-history-suggestions"
          data-testid="search-history-suggestions"
          data-state={showSuggestions ? 'open' : 'closed'}
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-card border-2 border-border rounded-md shadow-md z-50"
        >
          <div className="py-1">
            <div className="px-3 py-2 text-xs text-muted-foreground">{historyLabel}</div>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                role="option"
                data-testid="search-history-suggestion"
                aria-selected={false}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm"
                onClick={() => {
                  // UX Design: History selection fills the input without triggering search,
                  // allowing users to edit conceptual queries before submission.
                  // This differs from main SearchBox where immediate search is acceptable.
                  // See PR #158 for original UX fix rationale.
                  applyQueryFromExternal(suggestion);
                  setShowSuggestions(false);
                }}
              >
                <Search className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shortcutHint === null ? null : (
        <div className="mt-2 text-xs text-muted-foreground text-center">
          {shortcutHint ?? (
            <>
              キーボードショートカット: <kbd className="px-1 py-0.5 bg-muted rounded">Cmd+Shift+K</kbd> または{' '}
              <kbd className="px-1 py-0.5 bg-muted rounded">Ctrl+Shift+K</kbd>
            </>
          )}
        </div>
      )}
    </div>
  );
}
