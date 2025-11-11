'use client';

import { Suspense, use, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

/**
 * Article Relationship Graph Page
 *
 * Visualizes article relationships as an interactive network graph.
 *
 * Phase 1: Tag-based relationships
 * Phase 2: Embedding-based relationships
 * Phase 3: Hybrid + controls
 *
 * CodexMCP recommendations:
 * - Dynamic import with ssr: false (WebGL/Canvas)
 * - Suspense boundary for safe rendering
 * - Client component (use client directive)
 *
 * @see Plan: .claude/docs/plan/plan_20251111_233131_021_article-relationship-graph.md
 */

// CodexMCP: Use react-force-graph-2d to avoid AFRAME dependency
const ForceGraph2D = dynamic<any>(
  () => import('react-force-graph-2d'),
  { ssr: false, loading: () => <GraphSkeleton /> }
);

export default function ArticleRelationshipGraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<GraphSkeleton />}>
      <GraphContainer params={params} />
    </Suspense>
  );
}

function GraphContainer({ params }: { params: Promise<{ id: string }> }) {
  const { id: articleId } = use(params);
  const router = useRouter();

  // Fetch graph data
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch(`/api/articles/${articleId}/relationship-graph?algorithm=tag&maxNodes=20`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch graph data');
        return res.json();
      })
      .then(data => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [articleId]);

  if (loading) return <GraphSkeleton />;
  if (error) return <GraphError error={error} />;
  if (!graphData) return null;

  return (
    <div className="relative h-screen w-full bg-slate-950">
      <ForceGraph2D
        graphData={graphData}
        nodeLabel="label"
        nodeVal="val"
        nodeColor="color"
        linkWidth={(link: any) => link.value * 5}
        linkDirectionalParticles={2}
        onNodeClick={(node: any) => router.push(node.url)}
        backgroundColor="#020617"
        linkColor={() => 'rgba(148, 163, 184, 0.3)'}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      />

      <div className="absolute top-4 left-4 bg-slate-900/90 p-4 rounded-lg shadow-lg">
        <h2 className="text-lg font-bold text-white mb-2">Article Relationship Graph</h2>
        <p className="text-sm text-slate-300">
          Nodes: {graphData.nodes.length} | Links: {graphData.links.length}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Algorithm: {graphData.metadata.algorithm}
        </p>
      </div>
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-slate-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">Loading relationship graph...</p>
      </div>
    </div>
  );
}

function GraphError({ error }: { error: Error }) {
  return (
    <div className="flex items-center justify-center h-screen w-full bg-slate-950">
      <div className="text-center">
        <p className="text-red-400 text-lg mb-2">Failed to load graph</p>
        <p className="text-slate-400 text-sm">{error.message}</p>
      </div>
    </div>
  );
}
