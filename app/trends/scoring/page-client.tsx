'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { TrendScoreCard } from './components/TrendScoreCard';
import { MaturityBadge } from './components/MaturityBadge';
import type {
  TrendScoreResult,
  TechMaturityStage,
} from '@/lib/types/trend-types';

type StageFilter = 'ALL' | TechMaturityStage;
type SortOption = 'score' | 'name' | 'stage';

const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'EMERGING', label: '新興' },
  { value: 'RISING', label: '上昇' },
  { value: 'ESTABLISHED', label: '安定' },
  { value: 'DECLINING', label: '衰退' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'score', label: 'スコア' },
  { value: 'name', label: '名前' },
  { value: 'stage', label: 'ステージ' },
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

  const handleCardClick = useCallback(
    (entityId: string) => {
      setSelectedEntityId(selectedEntityId === entityId ? null : entityId);
    },
    [selectedEntityId]
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
                並べ替え: {opt.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--tt-color-text-muted)" />
            <input
              type="text"
              placeholder="エンティティを検索..."
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
          {filteredAndSorted.length} / {scores.length} 件
          {total > scores.length && (
            <span className="ml-1">
              (全{total}件中 上位{scores.length}件を表示)
            </span>
          )}
        </span>
        {lastUpdatedAt && (
          <span>
            最終更新: {new Date(lastUpdatedAt).toLocaleDateString('ja-JP')}
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
          </CardV2Content>
        </CardV2>
      )}

      {/* Score cards grid */}
      {filteredAndSorted.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">
          条件に一致するエンティティが見つかりませんでした。
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
