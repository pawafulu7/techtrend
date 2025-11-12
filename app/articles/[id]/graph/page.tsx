'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { Network } from 'lucide-react';
import type { GraphData, GraphNode, GraphLink } from '@/lib/types/graph';

interface LinkMetadata {
  similarity: number;
  commonTags?: number;
  type: GraphLink['type'];
}

interface ForceGraphRef {
  d3Force: (forceName: string) => any;
  d3ReheatSimulation: () => void;
}

// Utility function for safe label prefix removal
const removeCenterPrefix = (label: string) => label.replace(/^\[中心\]\s*/, '');

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
// Note: Using 'any' type due to complex FCwithRef type from library
const ForceGraph2D = dynamic<any>(
  () => import('react-force-graph-2d'),
  { ssr: false, loading: () => <GraphSkeleton /> }
);

export default function ArticleRelationshipGraphPage() {
  return (
    <Suspense fallback={<GraphSkeleton />}>
      <GraphContainer />
    </Suspense>
  );
}

function GraphContainer() {
  // P1 Fix: Use useParams() instead of use() on params
  const params = useParams();
  const articleId = params.id as string;
  const router = useRouter();

  // Fetch graph data
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [linkMap, setLinkMap] = useState<Map<string, LinkMetadata>>(new Map());
  const graphRef = useRef<ForceGraphRef | null>(null);

  useEffect(() => {
    // CodeRabbit: AbortController for cleanup
    const abortController = new AbortController();

    fetch(`/api/articles/${articleId}/relationship-graph?algorithm=embedding&maxNodes=30&minSimilarity=0.3`, {
      signal: abortController.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch graph data');
        return res.json();
      })
      .then(data => {
        setGraphData(data);
        setLoading(false);

        // CodexMCP: Create stable map for tooltip lookup (before force-graph mutates links)
        const map = new Map<string, LinkMetadata>();
        data.links.forEach((link: GraphLink) => {
          const targetId = typeof link.target === 'string' ? link.target : link.target.id;
          map.set(targetId, {
            similarity: link.value,
            commonTags: link.commonTags,
            type: link.type,
          });
        });
        setLinkMap(map);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;  // CodeRabbit: Ignore abort errors
        setError(err);
        setLoading(false);
      });

    return () => abortController.abort();  // CodeRabbit: Cleanup on unmount
  }, [articleId]);

  // CodexMCP Phase 2: Configure force parameters via ref
  useEffect(() => {
    if (!graphRef.current || !graphData) return;

    // Retry force config until ref is ready (CodexMCP: timing issue fix)
    const configureForces = () => {
      if (!graphRef.current) return;

      const charge = graphRef.current.d3Force('charge');
      if (charge) charge.strength(-250);  // Stronger repulsion

      const link = graphRef.current.d3Force('link');
      if (link) {
        link.distance(180);  // Longer links for more space
        link.strength(0.6);
      }

      // CodexMCP Phase 2: Configure collision force to prevent node overlap
      // Note: react-force-graph-2d provides d3 forces internally
      const collide = graphRef.current.d3Force('collide');
      if (collide && typeof collide.radius === 'function') {
        // Radius = sqrt(val) * 6 (larger than visual radius * 4)
        collide.radius((node: any) => Math.sqrt(node.val || 25) * 6);
      }

      graphRef.current.d3ReheatSimulation();
    };

    // CodexMCP: requestAnimationFrame to ensure ref is ready
    requestAnimationFrame(configureForces);
  }, [graphData]);

  if (loading) return <GraphSkeleton />;
  if (error) return <GraphError error={error} />;
  if (!graphData) return null;

  // Find center article for display
  const centerNode = graphData.nodes.find((n: any) => n.id === graphData.metadata?.centerArticleId);

  return (
    <div className="relative h-screen w-full bg-slate-950">
      <ForceGraph2D
        graphData={graphData}
        ref={graphRef}
        nodeLabel={(node: GraphNode) => {
          // CodexMCP: Use stable map (before force-graph mutation)
          const isCenter = node.id === graphData.metadata?.centerArticleId;
          const linkData = linkMap.get(node.id);
          const commonTags = linkData?.commonTags || 0;
          const similarity = linkData?.similarity ? Math.round(linkData.similarity * 100) : 0;

          return `
${node.label}

${isCenter ? '[この記事を中心に関連記事を表示]' : `
関連度: ${similarity}%
共通タグ数: ${commonTags}個
カテゴリ: ${node.category}
`}
${node.summary ? `\n${node.summary.substring(0, 80)}...` : ''}
`.trim();
        }}
        nodeVal="val"
        nodeColor="color"
        nodeCanvasObject={(node: GraphNode & { x: number; y: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // CodexMCP: Draw center node with special border
          const isCenter = node.id === graphData.metadata?.centerArticleId;
          const label = node.label;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;

          // Draw circle
          ctx.fillStyle = node.color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.sqrt(node.val) * 4, 0, 2 * Math.PI, false);
          ctx.fill();

          // CodexMCP: Draw border for center node
          if (isCenter) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3 / globalScale;
            ctx.stroke();
          }

          // Draw label (safe prefix removal)
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(removeCenterPrefix(label), node.x, node.y + Math.sqrt(node.val) * 4 + fontSize);
        }}
        linkWidth={(link: GraphLink) => Math.max(link.value * 8, 1)}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={4}
        onNodeClick={(node: GraphNode) => router.push(node.url)}
        onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
        backgroundColor="#020617"
        linkColor={() => 'rgba(148, 163, 184, 0.4)'}
        // CodexMCP: Layout parameters (supported props only)
        warmupTicks={60}
        cooldownTicks={400}
        d3AlphaDecay={0.008}
        d3VelocityDecay={0.12}
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      />

      {/* CodexMCP: Legend card (always visible) */}
      <div className="absolute top-4 left-4 bg-slate-900/95 p-4 rounded-lg shadow-xl border border-slate-700 max-w-xs">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Network className="h-4 w-4" />
          グラフの見方
        </h3>
        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-white shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-white">中心ノード（大・黄色・白枠）</div>
              <div className="text-slate-400">現在の記事</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">関連記事（小・色付き）</div>
              <div className="text-slate-400">色 = カテゴリ、大きさ = 品質</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-8 h-0.5 bg-slate-400 shrink-0 mt-2" />
            <div>
              <div className="font-medium">線の太さ = 関連度</div>
              <div className="text-slate-400">太いほど関連性が高い</div>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
          クリック: 記事を開く | ホバー: 詳細表示
        </div>
      </div>

      {/* Center article info */}
      <div className="absolute top-4 right-4 bg-slate-900/95 p-4 rounded-lg shadow-xl border border-slate-700 max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />
          <h3 className="text-sm font-bold text-white">中心記事</h3>
        </div>
        {centerNode && (
          <div className="space-y-1">
            <p className="text-sm text-white font-medium">{removeCenterPrefix(centerNode.label)}</p>
            <p className="text-xs text-slate-400">
              カテゴリ: {centerNode.category} | 品質: {Math.round(centerNode.val)}
            </p>
          </div>
        )}
        <div className="mt-2 pt-2 border-t border-slate-700">
          <p className="text-xs text-slate-300">
            関連記事: {graphData.nodes.length - 1}件表示
          </p>
        </div>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode && hoveredNode.id !== graphData.metadata?.centerArticleId && (
        <div className="absolute bottom-4 left-4 bg-slate-900/95 p-4 rounded-lg shadow-xl border border-slate-700 max-w-md">
          <h4 className="text-sm font-bold text-white mb-2">{hoveredNode.label}</h4>
          {hoveredNode.summary && (
            <p className="text-xs text-slate-300 mb-2">{hoveredNode.summary.substring(0, 120)}...</p>
          )}
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">カテゴリ:</span>
              <span className="text-white">{hoveredNode.category}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">品質スコア:</span>
              <span className="text-white">{Math.round(hoveredNode.val)}</span>
            </div>
            {hoveredNode.primaryTag && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">主要タグ:</span>
                <span className="text-white">{hoveredNode.primaryTag}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">クリックで記事を開く</p>
        </div>
      )}
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
