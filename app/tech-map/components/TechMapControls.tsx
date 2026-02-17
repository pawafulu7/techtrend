'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'LANGUAGE', label: 'Language' },
  { value: 'FRAMEWORK', label: 'Framework' },
  { value: 'TOOL', label: 'Tool' },
  { value: 'CONCEPT', label: 'Concept' },
  { value: 'PLATFORM', label: 'Platform' },
  { value: 'LIBRARY', label: 'Library' },
] as const;

const TIME_RANGES = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
] as const;

interface SearchResult {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

interface TechMapControlsProps {
  onSearch: (query: string) => void;
  onTypeFilter: (type: string) => void;
  onTimeRange: (range: string) => void;
  onEntitySelect: (entityId: string) => void;
  activeType: string;
  activeTimeRange: string;
}

export function TechMapControls({
  onSearch,
  onTypeFilter,
  onTimeRange,
  onEntitySelect,
  activeType,
  activeTimeRange,
}: TechMapControlsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      onSearch(value);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (value.length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      searchTimeoutRef.current = setTimeout(async () => {
        // Abort previous search request
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
        }
        const abortController = new AbortController();
        searchAbortRef.current = abortController;
        setSearchLoading(true);
        try {
          const res = await fetch(
            `/api/tech-map/entities?search=${encodeURIComponent(value)}&limit=8`,
            { signal: abortController.signal }
          );
          if (!res.ok) return;
          const data = await res.json();
          setSearchResults(data.entities || []);
          setShowResults(true);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            // Expected when a new search supersedes the previous one
          } else {
            console.error(
              '[TechMapControls] Search autocomplete error:',
              error
            );
          }
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    },
    [onSearch]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  const typeColorMap: Record<string, string> = {
    LANGUAGE: 'bg-blue-500',
    FRAMEWORK: 'bg-purple-500',
    TOOL: 'bg-green-500',
    CONCEPT: 'bg-amber-500',
    PLATFORM: 'bg-red-500',
    LIBRARY: 'bg-teal-500',
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-2.5">
      {/* Search */}
      <div ref={searchContainerRef} className="relative min-w-[200px] flex-1">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search entities..."
            className="h-8 w-full rounded-md border border-slate-600 bg-slate-800 pr-8 pl-8 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowResults(false);
                onSearch('');
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-slate-600 bg-slate-800 py-1 shadow-xl">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  onEntitySelect(result.id);
                  setShowResults(false);
                  setSearchQuery(result.name);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-slate-700"
              >
                <div
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${typeColorMap[result.type] || 'bg-slate-500'}`}
                />
                <span className="flex-1 truncate text-white">
                  {result.name}
                </span>
                <span className="text-xs text-slate-400">
                  {result.mentionCount}
                </span>
              </button>
            ))}
          </div>
        )}

        {showResults && searchLoading && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-400 shadow-xl">
            Searching...
          </div>
        )}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1.5">
        <Filter className="h-4 w-4 text-slate-400" />
        <select
          value={activeType}
          onChange={(e) => onTypeFilter(e.target.value)}
          className="h-8 rounded-md border border-slate-600 bg-slate-800 px-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          {ENTITY_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Time range */}
      <div className="flex items-center gap-1">
        {TIME_RANGES.map(({ value, label }) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            onClick={() => onTimeRange(value)}
            className={`h-7 px-2.5 text-xs ${
              activeTimeRange === value
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
