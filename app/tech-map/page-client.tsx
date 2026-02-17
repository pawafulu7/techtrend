'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { TechMapSkeleton } from './components/TechMapSkeleton';
import { TechMapSidePanel } from './components/TechMapSidePanel';
import { TechMapControls } from './components/TechMapControls';
import { TechMapLegend } from './components/TechMapLegend';

const TechMapGraph = dynamic(() => import('./components/TechMapGraph'), {
  ssr: false,
  loading: () => <TechMapSkeleton />,
});

interface ApiNode {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
}

interface ApiEdge {
  source: string;
  target: string;
  relationType: string;
  strength: number;
}

interface TechMapPageClientProps {
  initialEntities: ApiNode[];
}

export default function TechMapPageClient({
  initialEntities,
}: TechMapPageClientProps) {
  // Graph data
  const [nodes, setNodes] = useState<ApiNode[]>(initialEntities);
  const [edges, setEdges] = useState<ApiEdge[]>([]);
  const [centerId, setCenterId] = useState<string | undefined>(undefined);

  // UI state
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [activeType, setActiveType] = useState('');
  const [activeTimeRange, setActiveTimeRange] = useState('3M');
  const [searchQuery, setSearchQuery] = useState('');
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Side panel visibility on mobile
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Refs for abort control
  const abortRef = useRef<AbortController | null>(null);

  // Load graph centered on an entity
  const loadGraphForEntity = useCallback(async (entityId: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abortController = new AbortController();
    abortRef.current = abortController;

    setGraphLoading(true);
    setGraphError(null);
    let aborted = false;
    try {
      const res = await fetch(
        `/api/tech-map/graph?center=${entityId}&depth=2`,
        { signal: abortController.signal }
      );
      if (!res.ok) throw new Error('Failed to load graph');
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setCenterId(entityId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        aborted = true;
        return;
      }
      console.error('Failed to load graph:', err);
      setGraphError(
        'グラフの読み込みに失敗しました。しばらくしてからもう一度お試しください。'
      );
    } finally {
      if (!aborted) {
        setGraphLoading(false);
      }
    }
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Handlers
  const handleNodeClick = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setSidePanelOpen(true);
  }, []);

  const handleNodeDoubleClick = useCallback(
    (entityId: string) => {
      loadGraphForEntity(entityId);
    },
    [loadGraphForEntity]
  );

  const handleEntityNavigate = useCallback(
    (entityId: string) => {
      setSelectedEntityId(entityId);
      loadGraphForEntity(entityId);
    },
    [loadGraphForEntity]
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleTypeFilter = useCallback((type: string) => {
    setActiveType(type);
    if (type) {
      setHiddenTypes((_prev) => {
        const allTypes = new Set([
          'LANGUAGE',
          'FRAMEWORK',
          'TOOL',
          'CONCEPT',
          'PLATFORM',
          'LIBRARY',
        ]);
        allTypes.delete(type);
        return allTypes;
      });
    } else {
      setHiddenTypes(new Set());
    }
  }, []);

  const handleTimeRange = useCallback((range: string) => {
    setActiveTimeRange(range);
    // Time range filtering would need backend support; stored for future use
  }, []);

  const handleEntitySelect = useCallback(
    (entityId: string) => {
      loadGraphForEntity(entityId);
      setSelectedEntityId(entityId);
      setSidePanelOpen(true);
    },
    [loadGraphForEntity]
  );

  const handleCloseSidePanel = useCallback(() => {
    setSelectedEntityId(null);
    setSidePanelOpen(false);
  }, []);

  // Filter nodes by search query (client-side)
  const filteredNodes =
    searchQuery.length >= 2
      ? nodes.filter((n) =>
          n.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : nodes;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      {/* Controls bar */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <TechMapControls
          onSearch={handleSearch}
          onTypeFilter={handleTypeFilter}
          onTimeRange={handleTimeRange}
          onEntitySelect={handleEntitySelect}
          activeType={activeType}
          activeTimeRange={activeTimeRange}
        />
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Graph area */}
        <div className="relative flex-1">
          {graphLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80">
              <div className="text-center">
                <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-white" />
                <p className="text-sm text-slate-300">Loading graph...</p>
              </div>
            </div>
          )}
          {graphError && (
            <div className="absolute inset-x-0 top-4 z-10 mx-auto max-w-md px-4">
              <div className="rounded-lg border border-red-500/30 bg-red-950/80 px-4 py-3 text-center text-sm text-red-200">
                {graphError}
              </div>
            </div>
          )}
          <TechMapGraph
            nodes={filteredNodes}
            edges={edges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            hiddenTypes={hiddenTypes}
            centerId={centerId}
          />
        </div>

        {/* Side panel - desktop */}
        {selectedEntityId && (
          <div className="hidden lg:block">
            <TechMapSidePanel
              entityId={selectedEntityId}
              onClose={handleCloseSidePanel}
              onEntityNavigate={handleEntityNavigate}
            />
          </div>
        )}
      </div>

      {/* Legend bar */}
      <div className="shrink-0 px-4 py-2">
        <TechMapLegend />
      </div>

      {/* Side panel - mobile (bottom sheet) */}
      {selectedEntityId && sidePanelOpen && (
        <div className="fixed inset-x-0 bottom-0 z-50 h-1/2 lg:hidden">
          <TechMapSidePanel
            entityId={selectedEntityId}
            onClose={handleCloseSidePanel}
            onEntityNavigate={handleEntityNavigate}
          />
        </div>
      )}
    </div>
  );
}
