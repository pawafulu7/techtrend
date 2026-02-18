'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { TrendScoreCard } from './components/TrendScoreCard';
import { MaturityBadge } from './components/MaturityBadge';
import type {
  TrendScoreResult,
  TechMaturityStage,
  ScoreHistoryPoint,
} from '@/lib/types/trend-types';

const TrendScoreChart = dynamic(() => import('./components/TrendScoreChart'), {
  ssr: false,
  loading: () => (
    <div className="h-[250px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
  ),
});

type StageFilter = 'ALL' | TechMaturityStage;
type SortOption = 'score' | 'name' | 'stage';

const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'EMERGING', label: 'Emerging' },
  { value: 'RISING', label: 'Rising' },
  { value: 'ESTABLISHED', label: 'Established' },
  { value: 'DECLINING', label: 'Declining' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'name', label: 'Name' },
  { value: 'stage', label: 'Stage' },
];

const STAGE_ORDER: Record<TechMaturityStage, number> = {
  EMERGING: 0,
  RISING: 1,
  ESTABLISHED: 2,
  DECLINING: 3,
};

interface ScoringPageClientProps {
  initialScores: TrendScoreResult[];
  total: number;
  lastUpdatedAt: string | null;
}

export default function ScoringPageClient({
  initialScores,
  total,
  lastUpdatedAt,
}: ScoringPageClientProps) {
  const [scores, setScores] = useState(initialScores);
  useEffect(() => {
    setScores(initialScores);
  }, [initialScores]);
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('score');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [history, setHistory] = useState<ScoreHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filteredAndSorted = useMemo(() => {
    let result = [...scores];

    // Filter by stage
    if (stageFilter !== 'ALL') {
      result = result.filter((s) => s.stage === stageFilter);
    }

    // Filter by search query
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.entityName.toLowerCase().includes(q));
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.score - a.score;
        case 'name':
          return a.entityName.localeCompare(b.entityName);
        case 'stage':
          return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
        default:
          return 0;
      }
    });

    return result;
  }, [scores, stageFilter, sortBy, searchQuery]);

  const selectedScore = useMemo(
    () => scores.find((s) => s.entityId === selectedEntityId) ?? null,
    [scores, selectedEntityId]
  );

  const fetchHistory = useCallback(async (entityId: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/tech-map/entities/${encodeURIComponent(entityId)}/trend?days=30`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      if (abortRef.current === controller) {
        setHistory(data.history ?? []);
        setHistoryError(null);
      }
    } catch (err) {
      if (
        (err as Error).name !== 'AbortError' &&
        abortRef.current === controller
      ) {
        console.error('[fetchHistory] Failed:', err);
        setHistoryError('Failed to load trend history');
        setHistory([]);
      }
    } finally {
      if (abortRef.current === controller) {
        setHistoryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const handleCardClick = useCallback(
    (entityId: string) => {
      if (selectedEntityId === entityId) {
        setSelectedEntityId(null);
        setHistory([]);
        setHistoryError(null);
      } else {
        setSelectedEntityId(entityId);
        fetchHistory(entityId);
      }
    },
    [selectedEntityId, fetchHistory]
  );

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-(--tt-color-text-muted)" />
          {STAGE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStageFilter(f.value)}
              aria-pressed={stageFilter === f.value}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                stageFilter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:text-foreground bg-(--tt-color-surface-hover) text-(--tt-color-text-muted)'
              }`}
            >
              {f.value === 'ALL' || stageFilter === f.value ? (
                f.label
              ) : (
                <MaturityBadge stage={f.value as TechMaturityStage} />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="ソート順"
            className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) px-3 py-1.5 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--tt-color-text-muted)" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="エンティティを検索"
              className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) py-1.5 pr-8 pl-9 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="検索をクリア"
                className="hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 text-(--tt-color-text-muted)"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-muted-foreground mb-4 flex items-center gap-4 text-sm">
        <span>
          {filteredAndSorted.length} / {scores.length} entities
          {total > scores.length && (
            <span className="ml-1">
              (showing top {scores.length} of {total})
            </span>
          )}
        </span>
        {lastUpdatedAt && (
          <span>
            Last updated: {new Date(lastUpdatedAt).toLocaleDateString('ja-JP')}
          </span>
        )}
      </div>

      {/* Detail panel for selected entity */}
      {selectedScore && (
        <CardV2 className="mb-6">
          <CardV2Content className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-foreground text-lg font-semibold">
                  {selectedScore.entityName}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <MaturityBadge stage={selectedScore.stage} />
                  <span className="text-sm text-(--tt-color-text-muted)">
                    {selectedScore.entityType}
                  </span>
                </div>
              </div>
              <div className="text-foreground text-3xl font-bold">
                {Math.round(selectedScore.score)}
              </div>
            </div>
            <TrendScoreChart data={history} loading={historyLoading} />
            {historyError && (
              <p className="mt-2 text-sm text-red-500">{historyError}</p>
            )}
          </CardV2Content>
        </CardV2>
      )}

      {/* Score cards grid */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          No entities found matching your criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAndSorted.map((score) => (
            <TrendScoreCard
              key={score.entityId}
              score={score}
              selected={selectedEntityId === score.entityId}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
