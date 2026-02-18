'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEntityTypeTextColor } from '../constants';

interface EntityDetail {
  entity: {
    id: string;
    name: string;
    type: string;
    mentionCount: number;
    aliases: string[];
    firstSeenAt: string | null;
    lastSeenAt: string | null;
  };
  relations?: Array<{
    sourceEntityId: string;
    targetEntityId: string;
    relationType: string;
    strength: number;
    sourceEntityName?: string;
    targetEntityName?: string;
  }>;
  recentMetrics?: Array<{
    id: string;
    source: string;
    metricType: string;
    value: number;
    measuredAt: string;
  }>;
}

interface TechMapSidePanelProps {
  entityId: string | null;
  onClose: () => void;
  onEntityNavigate: (entityId: string) => void;
}

export function TechMapSidePanel({
  entityId,
  onClose,
  onEntityNavigate,
}: TechMapSidePanelProps) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const prevEntityIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDetail = useCallback(async (id: string, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tech-map/entities/${encodeURIComponent(id)}?include=relations,metrics`,
        { signal }
      );
      if (!isMountedRef.current) return;
      if (!res.ok) throw new Error('Failed to fetch entity detail');
      const data: EntityDetail = await res.json();
      if (!isMountedRef.current) return;
      setDetail(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (!isMountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!entityId) return;
    if (entityId === prevEntityIdRef.current && retryCount === 0) return;
    prevEntityIdRef.current = entityId;
    setRetryCount(0);

    const abortController = new AbortController();
    fetchDetail(entityId, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [entityId, fetchDetail, retryCount]);

  if (!entityId) return null;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-slate-700 bg-slate-900/95 lg:w-96">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Entity Details</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close entity details"
          className="h-7 w-7 p-0 text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded bg-slate-700" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-700" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-700" />
          </div>
        )}

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => setRetryCount((c) => c + 1)}
              className="text-xs text-slate-400 underline hover:text-white"
            >
              Retry
            </button>
          </div>
        )}

        {detail && !loading && (
          <div className="space-y-4">
            {/* Entity Name & Type */}
            <div>
              <h3 className="text-lg font-bold text-white">
                {detail.entity.name}
              </h3>
              <span
                className={`text-xs font-medium ${getEntityTypeTextColor(detail.entity.type)}`}
              >
                {detail.entity.type}
              </span>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Mentions"
                value={detail.entity.mentionCount.toLocaleString()}
              />
              <MetricCard
                label="Last Seen"
                value={formatRelativeDate(detail.entity.lastSeenAt)}
              />
            </div>

            {/* Aliases */}
            {detail.entity.aliases && detail.entity.aliases.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Aliases
                </h4>
                <div className="flex flex-wrap gap-1">
                  {detail.entity.aliases.map((alias) => (
                    <span
                      key={alias}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Relations */}
            {detail.relations && detail.relations.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Relations ({detail.relations.length})
                </h4>
                <div className="space-y-1">
                  {detail.relations.slice(0, 10).map((rel, i) => {
                    const isSource = rel.sourceEntityId === entityId;
                    const relatedId = isSource
                      ? rel.targetEntityId
                      : rel.sourceEntityId;
                    const relatedName = isSource
                      ? rel.targetEntityName
                      : rel.sourceEntityName;
                    return (
                      <button
                        key={`${rel.sourceEntityId}-${rel.targetEntityId}-${i}`}
                        onClick={() => onEntityNavigate(relatedId)}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors hover:bg-slate-800"
                      >
                        <span className="text-slate-300">
                          {relatedName && (
                            <span className="mr-1 font-medium text-white">
                              {relatedName}
                            </span>
                          )}
                          {rel.relationType.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-500">
                            {Math.round(rel.strength * 100)}%
                          </span>
                          <ChevronRight className="h-3 w-3 text-slate-500" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Metrics */}
            {detail.recentMetrics && detail.recentMetrics.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Recent Metrics
                </h4>
                <div className="space-y-1">
                  {detail.recentMetrics.slice(0, 5).map((metric) => (
                    <div
                      key={metric.id}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs"
                    >
                      <span className="text-slate-300">
                        {metric.source}: {metric.metricType}
                      </span>
                      <span className="font-mono text-white">
                        {metric.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function formatRelativeDate(isoDate: string | null | undefined): string {
  if (!isoDate) return 'N/A';
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return 'Unknown';

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'Just now'; // Future dates treated as current
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return 'Unknown';
  }
}
