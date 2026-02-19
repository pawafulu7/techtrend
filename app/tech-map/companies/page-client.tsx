'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { SlidersHorizontal } from 'lucide-react';
import { CardV2, CardV2Content } from '@/components/ui-v2/card-v2';
import { CompanyHeatmap } from './components/CompanyHeatmap';

const CompanyTimeline = dynamic(() => import('./components/CompanyTimeline'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
  ),
});

interface Company {
  groupId: string;
  name: string;
  articleCount: number;
}

interface Technology {
  entityId: string;
  name: string;
  type: string;
}

interface MatrixEntry {
  companyGroupId: string;
  entityId: string;
  mentionCount: number;
}

interface CompanyTechMatrix {
  companies: Company[];
  technologies: Technology[];
  matrix: MatrixEntry[];
}

interface TimelineEntry {
  month: string;
  entities: { entityId: string; name: string; count: number }[];
}

interface CompanyTimeline {
  company: { groupId: string; name: string };
  timeline: TimelineEntry[];
}

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'LANGUAGE', label: 'Languages' },
  { value: 'FRAMEWORK', label: 'Frameworks' },
  { value: 'LIBRARY', label: 'Libraries' },
  { value: 'TOOL', label: 'Tools' },
  { value: 'PLATFORM', label: 'Platforms' },
  { value: 'DATABASE', label: 'Databases' },
];

interface CompaniesPageClientProps {
  initialData: CompanyTechMatrix;
}

export default function CompaniesPageClient({
  initialData,
}: CompaniesPageClientProps) {
  const [data, setData] = useState(initialData);
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [entityType, setEntityType] = useState('');
  const [minMentions, setMinMentions] = useState(2);
  const [techLimit, setTechLimit] = useState(20);
  const [loading, setLoading] = useState(false);

  // Timeline state
  const [selectedCompany, setSelectedCompany] =
    useState<CompanyTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', techLimit.toString());
      params.set('minMentions', minMentions.toString());
      if (entityType) {
        params.set('entityTypes', entityType);
      }
      const res = await fetch(`/api/tech-map/companies?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('[CompaniesPage] fetch matrix error:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, minMentions, techLimit]);

  const handleFilterApply = useCallback(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const handleCompanyClick = useCallback(
    async (groupId: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      // If same company clicked, toggle off
      if (selectedCompany?.company.groupId === groupId) {
        setSelectedCompany(null);
        setTimelineError(null);
        return;
      }

      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const res = await fetch(
          `/api/tech-map/companies/${encodeURIComponent(groupId)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('Failed to fetch timeline');
        const result: CompanyTimeline = await res.json();
        if (abortRef.current === controller) {
          setSelectedCompany(result);
          setTimelineError(null);
        }
      } catch (err) {
        if (
          (err as Error).name !== 'AbortError' &&
          abortRef.current === controller
        ) {
          console.error('[CompaniesPage] timeline error:', err);
          setTimelineError('Failed to load company timeline');
          setSelectedCompany(null);
        }
      } finally {
        if (abortRef.current === controller) {
          setTimelineLoading(false);
        }
      }
    },
    [selectedCompany]
  );

  return (
    <div>
      {/* Filter Bar */}
      <CardV2 className="mb-6">
        <CardV2Content className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-(--tt-color-text-muted)" />
              <div>
                <label
                  htmlFor="entity-type"
                  className="mb-1 block text-xs text-(--tt-color-text-muted)"
                >
                  Entity Type
                </label>
                <select
                  id="entity-type"
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) px-3 py-1.5 text-sm"
                >
                  {ENTITY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="min-mentions"
                className="mb-1 block text-xs text-(--tt-color-text-muted)"
              >
                Min Mentions: {minMentions}
              </label>
              <input
                id="min-mentions"
                type="range"
                min={1}
                max={10}
                value={minMentions}
                onChange={(e) => setMinMentions(Number(e.target.value))}
                className="w-32"
              />
            </div>

            <div>
              <label
                htmlFor="tech-limit"
                className="mb-1 block text-xs text-(--tt-color-text-muted)"
              >
                Top Technologies: {techLimit}
              </label>
              <input
                id="tech-limit"
                type="range"
                min={5}
                max={30}
                step={5}
                value={techLimit}
                onChange={(e) => setTechLimit(Number(e.target.value))}
                className="w-32"
              />
            </div>

            <button
              onClick={handleFilterApply}
              disabled={loading}
              className="rounded-md bg-(--tt-color-primary) px-4 py-1.5 text-sm font-medium text-(--tt-color-on-primary) transition-colors hover:bg-(--tt-color-primary-hover) disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Apply'}
            </button>
          </div>
        </CardV2Content>
      </CardV2>

      {/* Stats bar */}
      <div className="text-muted-foreground mb-4 text-sm">
        {data.companies.length} companies, {data.technologies.length}{' '}
        technologies
      </div>

      {/* Timeline Panel */}
      {(selectedCompany || timelineLoading) && (
        <CardV2 className="mb-6">
          <CardV2Content className="p-6">
            {timelineLoading ? (
              <div className="h-[300px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
            ) : selectedCompany ? (
              <CompanyTimeline
                companyName={selectedCompany.company.name}
                timeline={selectedCompany.timeline}
              />
            ) : null}
            {timelineError && (
              <p className="mt-2 text-sm text-red-500">{timelineError}</p>
            )}
          </CardV2Content>
        </CardV2>
      )}

      {/* Heatmap */}
      {loading ? (
        <div className="h-64 animate-pulse rounded bg-(--tt-color-surface-muted)" />
      ) : (
        <CompanyHeatmap
          companies={data.companies}
          technologies={data.technologies}
          matrix={data.matrix}
          onCompanyClick={handleCompanyClick}
        />
      )}
    </div>
  );
}
