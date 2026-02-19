'use client';

import { Fragment, useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MatrixEntry {
  companyGroupId: string;
  entityId: string;
  mentionCount: number;
}

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

export interface CompanyHeatmapProps {
  companies: Company[];
  technologies: Technology[];
  matrix: MatrixEntry[];
  onCompanyClick: (groupId: string) => void;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  company: string;
  technology: string;
  count: number;
}

function getCellColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return 'transparent';
  const opacity = Math.max(0.15, Math.min(1, count / maxCount));
  return `oklch(from var(--tt-color-primary) l c h / ${opacity.toFixed(2)})`;
}

export function CompanyHeatmap({
  companies,
  technologies,
  matrix,
  onCompanyClick,
}: CompanyHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    company: '',
    technology: '',
    count: 0,
  });

  const matrixMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of matrix) {
      map.set(`${entry.companyGroupId}:${entry.entityId}`, entry.mentionCount);
    }
    return map;
  }, [matrix]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const entry of matrix) {
      if (entry.mentionCount > max) max = entry.mentionCount;
    }
    return max;
  }, [matrix]);

  const handleCellHover = useCallback(
    (
      e: React.MouseEvent,
      companyName: string,
      techName: string,
      count: number
    ) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setTooltip({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        company: companyName,
        technology: techName,
        count,
      });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (companies.length === 0 || technologies.length === 0) {
    return (
      <div className="text-muted-foreground py-12 text-center">
        No data available for the current filters.
      </div>
    );
  }

  return (
    <>
      {/* Desktop: Heatmap Grid */}
      <div className="hidden overflow-x-auto sm:block">
        <div
          className="inline-grid gap-px"
          style={{
            gridTemplateColumns: `minmax(120px, 200px) repeat(${technologies.length}, minmax(32px, 1fr))`,
            gridTemplateRows: `auto repeat(${companies.length}, 32px)`,
          }}
          role="grid"
          aria-label="Company technology mentions heatmap"
        >
          {/* Header row: empty corner + tech names */}
          <div className="sticky left-0 z-10 bg-(--tt-color-surface)" />
          {technologies.map((tech) => (
            <div
              key={tech.entityId}
              className="flex items-end justify-center pb-1"
              title={tech.name}
            >
              <span className="max-w-[60px] origin-bottom-left -rotate-45 truncate text-xs text-(--tt-color-text-muted)">
                {tech.name}
              </span>
            </div>
          ))}

          {/* Data rows */}
          {companies.map((company) => (
            <Fragment key={company.groupId}>
              <button
                onClick={() => onCompanyClick(company.groupId)}
                className="sticky left-0 z-10 flex items-center bg-(--tt-color-surface) pr-2 text-left text-sm hover:text-(--tt-color-primary) focus-visible:ring-2 focus-visible:ring-(--tt-color-primary) focus-visible:outline-none focus-visible:ring-inset"
                title={`${company.name} (${company.articleCount} articles)`}
              >
                <span className="truncate">{company.name}</span>
              </button>
              {technologies.map((tech) => {
                const count =
                  matrixMap.get(`${company.groupId}:${tech.entityId}`) ?? 0;
                return (
                  <div
                    key={`${company.groupId}-${tech.entityId}`}
                    role="gridcell"
                    aria-label={`${company.name}, ${tech.name}: ${count} mentions`}
                    className="cursor-pointer rounded-sm transition-transform hover:scale-110 hover:ring-1 hover:ring-(--tt-color-border)"
                    style={{ backgroundColor: getCellColor(count, maxCount) }}
                    onMouseEnter={(e) =>
                      handleCellHover(e, company.name, tech.name, count)
                    }
                    onMouseLeave={handleCellLeave}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Mobile: List View */}
      <div className="space-y-2 sm:hidden">
        {companies.map((company) => {
          const companyTechs = technologies
            .map((tech) => ({
              ...tech,
              count: matrixMap.get(`${company.groupId}:${tech.entityId}`) ?? 0,
            }))
            .filter((t) => t.count > 0)
            .sort((a, b) => b.count - a.count);

          return (
            <button
              key={company.groupId}
              onClick={() => onCompanyClick(company.groupId)}
              className="w-full rounded-lg border border-(--tt-color-border) bg-(--tt-color-surface) p-3 text-left transition-colors hover:bg-(--tt-color-surface-hover)"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{company.name}</span>
                <span className="text-xs text-(--tt-color-text-muted)">
                  {company.articleCount} articles
                </span>
              </div>
              {companyTechs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {companyTechs.slice(0, 5).map((tech) => (
                    <span
                      key={tech.entityId}
                      className="inline-flex items-center gap-1 rounded-full bg-(--tt-color-surface-hover) px-2 py-0.5 text-xs text-(--tt-color-text-muted)"
                    >
                      {tech.name}
                      <span className="font-medium text-(--tt-color-text)">
                        {tech.count}
                      </span>
                    </span>
                  ))}
                  {companyTechs.length > 5 && (
                    <span className="text-xs text-(--tt-color-text-muted)">
                      +{companyTechs.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-(--tt-color-border) bg-(--tt-color-surface) px-3 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-medium">{tooltip.company}</div>
          <div className="text-(--tt-color-text-muted)">
            {tooltip.technology}: <strong>{tooltip.count}</strong> mentions
          </div>
        </div>
      )}
    </>
  );
}
