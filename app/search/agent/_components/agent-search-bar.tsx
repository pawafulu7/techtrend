'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  KeyboardEvent,
} from 'react';
import { Search, X, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui-v2/button-v2';
import { Badge } from '@/components/ui/badge';
import {
  useSearchHistory,
  type SearchHistoryItem,
} from '@/lib/hooks/useSearchHistory';

interface AgentSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  initialQuery?: string;
  onPrefillQuery?: (callback: (query: string) => void) => void;
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
  showHistoryTimestamp?: boolean;
  onHistoryCleared?: () => void;
}

export function AgentSearchBar({
  onSearch,
  isLoading = false,
  disabled = false,
  initialQuery = '',
  onPrefillQuery,
  badgeLabel = 'AI検索',
  badgeIcon,
  helperText = '',
  placeholder = '例: terraformについての記事をおすすめ5件教えて',
  submitLabel = '検索',
  loadingLabel = '検索中',
  shortcutHint,
  historyEnabled = true,
  historyLabel = '最近の検索',
  inputLabel = 'AI検索クエリ入力',
  showHistoryTimestamp = true,
  onHistoryCleared,
}: AgentSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchHistoryItem[]>([]);
  const {
    getSearchHistoryWithTimestamp,
    saveToHistory,
    removeFromHistory,
    clearHistory,
    getRelativeTime,
  } = useSearchHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const skipNextFocusRef = useRef(false);

  // Load history on mount and when suggestions are shown
  const refreshHistory = useCallback(() => {
    if (historyEnabled) {
      setHistoryItems(getSearchHistoryWithTimestamp().slice(0, 5));
    }
  }, [historyEnabled, getSearchHistoryWithTimestamp]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: load history on mount
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (showSuggestions && historyEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: refresh history when suggestions shown
      refreshHistory();
    }
  }, [showSuggestions, historyEnabled, refreshHistory]);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setHistoryItems([]);
    onHistoryCleared?.();
  }, [clearHistory, onHistoryCleared]);

  const handleRemoveHistoryItem = useCallback(
    (timestamp: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const updatedHistory = removeFromHistory(timestamp);
      setHistoryItems(updatedHistory.slice(0, 5));
      // Notify parent when history becomes empty (same as clear all)
      if (updatedHistory.length === 0) {
        onHistoryCleared?.();
      }
    },
    [removeFromHistory, onHistoryCleared]
  );

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === 'k'
      ) {
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
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
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

  return (
    <div ref={searchRef} className="relative mx-auto w-full max-w-4xl">
      {(badgeLabel || helperText) && (
        <div className="mb-2 flex items-center gap-2">
          {badgeLabel && (
            <Badge variant="secondary" className="text-xs">
              {badgeIcon ?? <Sparkles className="mr-1 h-3 w-3" />}
              {badgeLabel}
            </Badge>
          )}
          {helperText && (
            <span className="text-muted-foreground text-xs">{helperText}</span>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />

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
          className="bg-card border-border focus:border-primary border-2 py-6 pr-24 pl-10 text-base shadow-sm transition-all duration-200 focus:shadow-md"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled || isLoading}
          aria-label={inputLabel}
          data-testid="agent-search-input"
          aria-autocomplete="list"
          aria-controls="search-history-suggestions"
          aria-expanded={showSuggestions && historyItems.length > 0}
        />

        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
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
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                {loadingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>

      {historyEnabled && showSuggestions && historyItems.length > 0 && (
        <div
          id="search-history-suggestions"
          data-testid="search-history-suggestions"
          data-state={showSuggestions ? 'open' : 'closed'}
          role="listbox"
          className="bg-card border-border absolute top-full right-0 left-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-md border-2 shadow-md"
        >
          <div className="py-1">
            <div className="border-border flex items-center justify-between border-b px-3 py-2">
              <span className="text-muted-foreground text-xs">
                {historyLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearHistory}
                className="hover:text-destructive h-7 px-2 text-xs"
                aria-label="検索履歴をクリア"
                data-testid="clear-history-button"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                クリア
              </Button>
            </div>
            {historyItems.map((item) => (
              <div
                key={`${item.query}-${item.timestamp}`}
                className="group hover:bg-accent hover:text-accent-foreground flex items-center gap-1 px-3 py-3 md:py-2"
              >
                <button
                  type="button"
                  role="option"
                  data-testid="search-history-suggestion"
                  aria-selected={false}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left text-sm sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => {
                    // UX Design: History selection fills the input without triggering search,
                    // allowing users to edit conceptual queries before submission.
                    // This differs from main SearchBox where immediate search is acceptable.
                    // See PR #158 for original UX fix rationale.
                    applyQueryFromExternal(item.query);
                    setShowSuggestions(false);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Search className="text-muted-foreground h-3 w-3 flex-shrink-0" />
                    <span className="flex-1 truncate">{item.query}</span>
                  </div>
                  {showHistoryTimestamp && (
                    <span className="text-muted-foreground pl-5 text-xs sm:pl-0">
                      {getRelativeTime(item.timestamp)}
                    </span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleRemoveHistoryItem(item.timestamp, e)}
                  className="hover:text-destructive hover:bg-destructive/10 h-10 w-10 flex-shrink-0 p-0 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                  aria-label="この検索履歴を削除"
                  title="この検索履歴を削除"
                  data-testid="remove-history-item-button"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {shortcutHint === null ? null : (
        <div className="text-muted-foreground mt-2 text-center text-xs">
          {shortcutHint ?? (
            <>
              キーボードショートカット:{' '}
              <kbd className="bg-muted rounded px-1 py-0.5">Cmd+Shift+K</kbd>{' '}
              または{' '}
              <kbd className="bg-muted rounded px-1 py-0.5">Ctrl+Shift+K</kbd>
            </>
          )}
        </div>
      )}
    </div>
  );
}
