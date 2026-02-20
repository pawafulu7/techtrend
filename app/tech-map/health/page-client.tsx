'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { HealthScoreCard } from './components/HealthScoreCard';
import HealthRadarChart from './components/HealthRadarChart';
import type { HealthScoreResult } from './types';

type SortOption = 'overallHealth' | 'entityName' | 'entityType';
type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'overallHealth', label: 'Health Score' },
  { value: 'entityName', label: 'Name' },
  { value: 'entityType', label: 'Type' },
];

interface HealthPageClientProps {
  initialHealth: HealthScoreResult[];
}

export default function HealthPageClient({
  initialHealth,
}: HealthPageClientProps) {
  const [healthData, setHealthData] = useState(initialHealth);
  useEffect(() => {
    setHealthData(initialHealth);
  }, [initialHealth]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('overallHealth');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const filteredAndSorted = useMemo(() => {
    let result = [...healthData];

    // Filter by search query
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (h) =>
          h.entityName.toLowerCase().includes(q) ||
          h.entityType.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'overallHealth':
          cmp = a.overallHealth - b.overallHealth;
          break;
        case 'entityName':
          cmp = a.entityName.localeCompare(b.entityName);
          break;
        case 'entityType':
          cmp = a.entityType.localeCompare(b.entityType);
          break;
        default:
          cmp = 0;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [healthData, searchQuery, sortBy, sortOrder]);

  const selectedHealth = useMemo(
    () => healthData.find((h) => h.entityId === selectedEntityId) ?? null,
    [healthData, selectedEntityId]
  );

  const handleCardClick = useCallback((entityId: string) => {
    setSelectedEntityId((prev) => (prev === entityId ? null : entityId));
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  }, []);

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-(--tt-color-text-muted)" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort by"
            className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) px-3 py-1.5 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSortOrder}
            aria-label={`Sort order: ${sortOrder === 'desc' ? 'descending' : 'ascending'}`}
            className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) p-1.5 transition-colors hover:bg-(--tt-color-surface-hover)"
          >
            <ArrowUpDown className="h-4 w-4 text-(--tt-color-text-muted)" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--tt-color-text-muted)" />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search entities"
            className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) py-1.5 pr-8 pl-9 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-(--tt-color-text-muted) hover:text-(--tt-color-text)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-4 flex items-center gap-4 text-sm text-(--tt-color-text-muted)">
        <span>
          {filteredAndSorted.length} / {healthData.length} entities
        </span>
      </div>

      {/* Detail panel for selected entity */}
      {selectedHealth && (
        <CardV2 className="mb-6">
          <CardV2Content className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-foreground text-lg font-semibold">
                  {selectedHealth.entityName}
                </h2>
                <p className="mt-1 text-sm text-(--tt-color-text-muted)">
                  {selectedHealth.entityType}
                </p>
              </div>
              <div className="text-foreground text-3xl font-bold">
                {Math.round(selectedHealth.overallHealth)}
              </div>
            </div>
            <HealthRadarChart health={selectedHealth} />
          </CardV2Content>
        </CardV2>
      )}

      {/* Score cards grid */}
      {filteredAndSorted.length === 0 ? (
        <div className="py-12 text-center text-(--tt-color-text-muted)">
          <p className="text-lg font-medium">No health data available yet.</p>
          <p className="mt-2 text-sm">
            Health scores will be calculated automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAndSorted.map((health) => (
            <HealthScoreCard
              key={health.entityId}
              health={health}
              selected={selectedEntityId === health.entityId}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
