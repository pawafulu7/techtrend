'use client';

import { Suspense, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Network, ArrowLeft } from 'lucide-react';
import { forceCollide } from 'd3-force';
import { Button } from '@/components/ui/button';
import type { GraphData, GraphNode, GraphLink } from '@/lib/types/graph';
import { darkenColor, truncateLabel } from '@/lib/utils/graph-helpers';

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

// Utility function for formatting published date (hybrid: relative for recent, absolute for old)
const formatPublishedDate = (isoDate: string): string => {
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '配信日不明';

    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    // Recent articles: relative time
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;

    // Older articles: absolute date
    return date.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return '配信日不明';
  }
};

// Utility function for getting freshness indicator (border color and style)
const getFreshnessBorder = (publishedAt: string): { color: string; width: number } | null => {
  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) return null;

    const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

    // Fresh (within 7 days): green border
    if (diffDays < 7) return { color: '#10B981', width: 2.5 };

    // Recent (within 30 days): yellow border
    if (diffDays < 30) return { color: '#FBBF24', width: 2 };

    // Old (30+ days): no border
    return null;
  } catch {
    return null;
  }
};

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
  const [graphInstance, setGraphInstance] = useState<ForceGraphRef | null>(null);
  const [currentDepth, setCurrentDepth] = useState<1 | 2>(1);

  // CodexMCP: Callback ref to track when ForceGraph mounts
  const handleGraphRef = useCallback((instance: ForceGraphRef | null) => {
    graphRef.current = instance;
    setGraphInstance(instance);
  }, []);

  useEffect(() => {
    // CodeRabbit: AbortController for cleanup
    const abortController = new AbortController();
    let isActive = true;
    setLoading(true);
    setError(null);

    fetch(
      `/api/articles/${articleId}/relationship-graph?algorithm=embedding&maxNodes=8&minSimilarity=0.25&depth=${currentDepth}`,
      {
        signal: abortController.signal,
      }
    )
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch graph data');
        return res.json();
      })
      .then(data => {
        if (!isActive) return;
        setGraphData(data);

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
        if (!isActive) return;
        setError(err);
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
      abortController.abort();  // CodeRabbit: Cleanup on unmount
    };
  }, [articleId, currentDepth]);

  // CodexMCP: Configure force parameters (wait for both graphData and ref)
  useLayoutEffect(() => {
    if (!graphData || !graphInstance) return;

    const fg = graphInstance;
    const nodeCount = graphData.nodes.length;
    const isExpandedDepth = currentDepth === 2 || nodeCount > 10;
    const charge = isExpandedDepth ? -400 : -240;
    const linkDistance = isExpandedDepth ? 200 : 140;

    // Set charge force
    const chargeForce = fg.d3Force('charge');
    if (chargeForce) chargeForce.strength(charge);

    // Set link force
    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce.distance(linkDistance);
      linkForce.strength(0.8);
    }

    // CodexMCP: Add collide force to prevent overlap
    // Radius matches visual radius (*4) + padding
    const collide = forceCollide<GraphNode>()
      .radius((node) => {
        const depthSizeFactor = node.depth === 2 ? 0.7 : 1;
        const visualRadius = Math.sqrt(node.val ?? 1) * 4 * depthSizeFactor;
        const fontSize = 12;
        const padding = 10;
        return visualRadius + fontSize + padding;
      })
      .strength(1)
      .iterations(2);

    (fg as any).d3Force('collide', collide);
    fg.d3ReheatSimulation();

    return () => {
      // Cleanup: remove collide force
      (fg as any).d3Force('collide', null);
    };
  }, [graphData, graphInstance, currentDepth]);

  if (loading) return <GraphSkeleton />;
  if (error) return <GraphError error={error} />;
  if (!graphData) return null;

  // Find center article for display
  const centerNode = graphData.nodes.find((n: any) => n.id === graphData.metadata?.centerArticleId);

  return (
    <div className="relative h-screen w-full bg-slate-950">
      <ForceGraph2D
        graphData={graphData}
        ref={handleGraphRef}
        nodeLabel={(node: GraphNode) => {
          // CodexMCP: Use stable map (before force-graph mutation)
          const isCenter = node.id === graphData.metadata?.centerArticleId;
          const linkData = linkMap.get(node.id);
          const commonTags = linkData?.commonTags || 0;
          const similarity = linkData?.similarity ? Math.round(linkData.similarity * 100) : 0;

          return `
${node.label}

配信: ${formatPublishedDate(node.publishedAt)}
${isCenter ? '[この記事を中心に関連記事を表示]' : `
関連度: ${similarity}%
共通タグ数: ${commonTags}個
カテゴリ: ${node.category}
`}
${node.summary ? `\n${node.summary.substring(0, 70)}...` : ''}
`.trim();
        }}
        nodeVal="val"
        nodeColor="color"
        nodeCanvasObject={(node: GraphNode & { x: number; y: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // CodexMCP: Draw center node with special border
          const isCenter = node.id === graphData.metadata?.centerArticleId;
          const label = node.label;
          const fontSize = 12 / globalScale;
          const depthSizeFactor = node.depth === 2 ? 0.7 : 1;
          const radius = Math.sqrt(node.val) * 4 * depthSizeFactor;
          let fillColor = node.color;
          if (node.depth === 2) {
            fillColor = darkenColor(node.color, 0.8);
          }
          ctx.font = `${fontSize}px Sans-Serif`;

          // Draw circle (CodexMCP: *3 → *4 for better visibility)
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fill();

          // CodexMCP: Draw border for center node
          if (isCenter) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3 / globalScale;
            ctx.stroke();
          }

          // Draw freshness border (for non-center nodes)
          if (!isCenter) {
            const freshnessBorder = getFreshnessBorder(node.publishedAt);
            if (freshnessBorder) {
              ctx.strokeStyle = freshnessBorder.color;
              ctx.lineWidth = freshnessBorder.width / globalScale;
              ctx.stroke();
            }
          }

          // Draw NEW badge for articles within 24 hours (non-center only)
          if (!isCenter) {
            // Skip badge for very small nodes to avoid overwhelming them
            const screenRadius = radius * globalScale;
            if (screenRadius >= 8) {
              // Ensure publishedAt has timezone info (append 'Z' if missing)
              const publishedAtNormalized = node.publishedAt.endsWith('Z')
                ? node.publishedAt
                : node.publishedAt + 'Z';
              const timestamp = Date.parse(publishedAtNormalized);

              if (!isNaN(timestamp)) {
                const diffHours = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60));
                if (diffHours < 24) {
                  ctx.save();
                  const badgeRadius = 6 / globalScale;
                  const badgeOffset = radius * 0.7;
                  ctx.fillStyle = '#EF4444'; // Red
                  ctx.beginPath();
                  ctx.arc(node.x + badgeOffset, node.y - badgeOffset, badgeRadius, 0, 2 * Math.PI);
                  ctx.fill();
                  ctx.restore();
                }
              }
            }
          }

          // Draw label with outline (safe prefix removal)
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const maxLength = isCenter ? 40 : 20;
          const displayLabel = truncateLabel(removeCenterPrefix(label), maxLength);

          // Draw black outline for readability
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3 / globalScale;
          ctx.strokeText(displayLabel, node.x, node.y + radius + fontSize);

          // Draw white text
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(displayLabel, node.x, node.y + radius + fontSize);
        }}
        linkWidth={(link: GraphLink) => Math.max((link.value ** 2) * 18, 1.5)}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={4}
        onNodeClick={(node: GraphNode) => router.push(node.url)}
        onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
        backgroundColor="#020617"
        linkColor={() => 'rgba(148, 163, 184, 0.6)'}
        // CodexMCP: Layout parameters (supported props only)
        warmupTicks={100}
        cooldownTicks={400}
        d3AlphaDecay={0.008}
        d3VelocityDecay={0.35}
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      />

      {/* Back button */}
      <div className="absolute top-4 left-4">
        <Button variant="ghost" asChild className="text-white hover:bg-slate-800">
          <Link href={`/articles/${articleId}`} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            記事詳細に戻る
          </Link>
        </Button>
      </div>

      {/* CodexMCP: Legend card (always visible) */}
      <div className="absolute top-16 left-4 bg-slate-900/95 p-4 rounded-lg shadow-xl border border-slate-700 max-w-xs">
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
            <div className="w-2 h-2 rounded-full bg-indigo-300 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">関連記事 第2層（小・暗め）</div>
              <div className="text-slate-400">第1層記事に関連</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-8 h-0.5 bg-slate-400 shrink-0 mt-2" />
            <div>
              <div className="font-medium">線の太さ = 関連度</div>
              <div className="text-slate-400">太いほど関連性が高い</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500 border-2 border-green-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">枠線の色 = 配信日時</div>
              <div className="text-slate-400">緑=1週間以内、黄=1ヶ月以内</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">NEWバッジ（赤丸）</div>
              <div className="text-slate-400">24時間以内に配信</div>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
          クリック: 記事を開く | ホバー: 詳細表示
        </div>
      </div>

      {/* Depth toggle */}
      <button
        data-testid="depth-toggle-button"
        onClick={() => setCurrentDepth(d => (d === 1 ? 2 : 1))}
        className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-xl border border-indigo-500 text-sm font-medium transition-colors"
      >
        {currentDepth === 1 ? '関連をさらに表示（depth=2）' : '関連を折りたたむ（depth=1）'}
      </button>

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
          <p
            className="text-xs text-slate-300"
            data-testid="related-count"
            aria-live="polite"
          >
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
  console.error('[GraphError]', error);

  return (
    <div className="flex items-center justify-center h-screen w-full bg-slate-950">
      <div className="text-center">
        <p className="text-red-400 text-lg mb-2">Failed to load graph</p>
        {process.env.NODE_ENV === 'development' && (
          <p className="text-slate-400 text-sm" data-testid="graph-error-message">
            {error.message}
          </p>
        )}
      </div>
    </div>
  );
}
