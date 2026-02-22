'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
  type HierarchyRectangularNode,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';
import { interpolateRgb } from 'd3-interpolate';
import { cn } from '@/lib/utils';

export interface CategoryData {
  category: string;
  label: string;
  count: number;
  share: number;
  previousShare: number;
  changeRate: number;
}

interface TechSectorTreemapProps {
  data: CategoryData[];
  onCategoryClick?: (category: string) => void;
  loading?: boolean;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: CategoryData | null;
}

type TreemapNode = HierarchyRectangularNode<
  CategoryData | { children: CategoryData[] }
>;

const changeColorScale = scaleLinear<string>()
  .domain([-2, 0, 2])
  .range(['rgb(220,50,50)', 'rgb(160,160,160)', 'rgb(34,197,94)'])
  .interpolate(interpolateRgb)
  .clamp(true);

function SectorMapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function formatPt(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}pt`;
}

export function TechSectorTreemap({
  data,
  onCategoryClick,
  loading = false,
}: TechSectorTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    data: null,
  });
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Observe container size once the treemap container is actually rendered.
  // Initial mount can be a loading/empty branch where containerRef is null.
  useEffect(() => {
    if (loading || data.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = (width: number) => {
      if (width > 0) {
        const next = {
          width,
          height: Math.max(400, width * 0.6),
        };
        setDimensions((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next
        );
      }
    };

    // Read initial size immediately
    updateDimensions(container.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateDimensions(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [loading, data.length]);

  // Compute treemap layout
  const nodes = useMemo(() => {
    if (!data || data.length === 0 || dimensions.width === 0) return [];

    const root = hierarchy<CategoryData | { children: CategoryData[] }>({
      children: data,
    })
      .sum((d) => ('count' in d ? Math.max(d.count, 1) : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = treemap<CategoryData | { children: CategoryData[] }>()
      .size([dimensions.width, dimensions.height])
      .padding(2)
      .round(true)
      .tile(treemapSquarify);

    layout(root);

    return (root.leaves() as TreemapNode[]).filter(
      (node) =>
        node.x1 - node.x0 > 0 &&
        node.y1 - node.y0 > 0 &&
        'category' in node.data
    );
  }, [data, dimensions]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, nodeData: CategoryData) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Flip tooltip when near right edge
      const flipX = x > dimensions.width - 200;
      const clampedY = Math.max(10, Math.min(y - 10, dimensions.height - 100));

      setTooltip({
        visible: true,
        x: flipX ? x - 210 : x + 10,
        y: clampedY,
        data: nodeData,
      });
    },
    [dimensions.width, dimensions.height]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip({ visible: false, x: 0, y: 0, data: null });
    setHoveredCategory(null);
  }, []);

  const handleCellClick = useCallback(
    (category: string) => {
      onCategoryClick?.(category);
    },
    [onCategoryClick]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, category: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCategoryClick?.(category);
      }
    },
    [onCategoryClick]
  );

  if (loading) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <SectorMapIcon className="h-4 w-4 text-(--tt-color-secondary)" />
          <h3 className="text-sm font-semibold">テックセクターマップ</h3>
        </div>
        <div className="h-[400px] animate-pulse rounded bg-(--tt-color-surface-muted)" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-background rounded-lg border p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <SectorMapIcon className="h-4 w-4 text-(--tt-color-secondary)" />
          <h3 className="text-sm font-semibold">テックセクターマップ</h3>
        </div>
        <div className="text-muted-foreground flex h-[400px] items-center justify-center">
          データがありません
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <SectorMapIcon className="h-4 w-4 text-(--tt-color-secondary)" />
        <h3 className="text-sm font-semibold">テックセクターマップ</h3>
      </div>
      <div
        ref={containerRef}
        className="relative"
        style={{ minHeight: dimensions.height || 400 }}
        onMouseLeave={handleMouseLeave}
      >
        {dimensions.width > 0 && (
          <svg
            width={dimensions.width}
            height={dimensions.height}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="block"
          >
            {nodes.map((node) => {
              const d = node.data as CategoryData;
              if (!d.category) return null;
              const displayLabel = d.label ?? d.category;
              const w = node.x1 - node.x0;
              const h = node.y1 - node.y0;
              const isHovered = hoveredCategory === d.category;

              return (
                <g
                  key={d.category}
                  role="button"
                  tabIndex={0}
                  aria-label={`${displayLabel}: ${d.share.toFixed(1)}%, ${d.count}件, 変化${formatPt(d.changeRate)}`}
                  className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                  onClick={() => handleCellClick(d.category)}
                  onKeyDown={(e) => handleKeyDown(e, d.category)}
                  onMouseMove={(e) => {
                    setHoveredCategory(d.category);
                    handleMouseMove(e, d);
                  }}
                  onMouseLeave={() => {
                    setHoveredCategory(null);
                    setTooltip((prev) => ({ ...prev, visible: false }));
                  }}
                >
                  <rect
                    x={node.x0}
                    y={node.y0}
                    width={w}
                    height={h}
                    rx={4}
                    fill={changeColorScale(d.changeRate)}
                    className={cn(
                      'transition-opacity duration-150',
                      isHovered ? 'opacity-80' : 'opacity-100'
                    )}
                    stroke="var(--background)"
                    strokeWidth={1}
                  />
                  {/* Category label */}
                  {w > 60 && h > 40 && (
                    <text
                      x={node.x0 + w / 2}
                      y={node.y0 + h / 2 - (h > 60 ? 10 : 2)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={Math.min(14, w / 8)}
                      fontWeight="600"
                      className="pointer-events-none select-none"
                    >
                      {displayLabel.length > Math.floor(w / 10)
                        ? displayLabel.slice(0, Math.floor(w / 10)) + '...'
                        : displayLabel}
                    </text>
                  )}
                  {/* Share percentage */}
                  {w > 60 && h > 60 && (
                    <text
                      x={node.x0 + w / 2}
                      y={node.y0 + h / 2 + 6}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255,255,255,0.9)"
                      fontSize={Math.min(14, w / 8)}
                      fontWeight="500"
                      className="pointer-events-none select-none"
                    >
                      {d.share.toFixed(1)}%
                    </text>
                  )}
                  {/* Change rate in pt */}
                  {w > 80 && h > 80 && (
                    <text
                      x={node.x0 + w / 2}
                      y={node.y0 + h / 2 + 22}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="rgba(255,255,255,0.7)"
                      fontSize={Math.min(11, w / 10)}
                      className="pointer-events-none select-none"
                    >
                      {formatPt(d.changeRate)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {/* Tooltip */}
        {tooltip.visible && tooltip.data && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute z-50 rounded-md border px-3 py-2 shadow-md"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              maxWidth: 200,
            }}
          >
            <div className="text-sm font-semibold">
              {tooltip.data.label ?? tooltip.data.category}
            </div>
            <div className="text-muted-foreground mt-1 space-y-0.5 text-xs">
              <div>シェア: {tooltip.data.share.toFixed(1)}%</div>
              <div>記事数: {tooltip.data.count}件</div>
              <div>前期シェア: {tooltip.data.previousShare.toFixed(1)}%</div>
              <div
                className={cn(
                  'font-medium',
                  tooltip.data.changeRate > 0
                    ? 'text-green-600 dark:text-green-400'
                    : tooltip.data.changeRate < 0
                      ? 'text-red-600 dark:text-red-400'
                      : ''
                )}
              >
                変化: {formatPt(tooltip.data.changeRate)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
