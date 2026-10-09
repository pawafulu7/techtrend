'use client';

import {
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { forceCollide } from 'd3-force';
import type { GraphData, GraphNode, GraphLink } from '@/lib/types/graph';
import {
  darkenColor,
  removeCenterPrefix,
  truncateLabel,
} from '@/lib/utils/graph-helpers';
import { GraphOverlays } from './_components/graph-overlays';
import { GraphError, GraphSkeleton } from './_components/graph-status';
import { darkColors, withAlpha } from '@/lib/design-tokens';

interface LinkMetadata {
  similarity: number;
  commonTags?: number;
  type: GraphLink['type'];
}

interface ForceGraphRef {
  d3Force: (forceName: string) => any;
  d3ReheatSimulation: () => void;
}

// リンクの線: ダークの補助文字色（slate-400）を 60% の不透明度で
const GRAPH_LINK_COLOR = withAlpha(darkColors.textMuted, 0.6);

// Utility function for safe label prefix removal

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
const getFreshnessBorder = (
  publishedAt: string
): { color: string; width: number } | null => {
  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) return null;

    const diffDays = Math.floor(
      (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fresh (within 7 days): green border
    if (diffDays < 7) return { color: darkColors.positive, width: 2.5 };

    // Recent (within 30 days): orange border
    if (diffDays < 30) return { color: darkColors.warning, width: 2 };

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
const ForceGraph2D = dynamic<any>(() => import('react-force-graph-2d'), {
  ssr: false,
  // GraphContainer の中で読み込むので、見出し（h1）は GraphContainer 側にある。ここでは出さない
  loading: () => <GraphSkeleton withHeading={false} />,
});

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
  // キャンバスの大きさを画面の回転・リサイズに追従させる
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));
  // 凡例の開閉。深さの切り替えでオーバーレイが作り直されても保つ（未操作なら画面幅で決める）
  const [legendOpen, setLegendOpen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [linkMap, setLinkMap] = useState<Map<string, LinkMetadata>>(new Map());
  const graphRef = useRef<ForceGraphRef | null>(null);
  const [graphInstance, setGraphInstance] = useState<ForceGraphRef | null>(
    null
  );
  const [currentDepth, setCurrentDepth] = useState<1 | 2>(1);

  // CodexMCP: Callback ref to track when ForceGraph mounts
  const handleGraphRef = useCallback((instance: ForceGraphRef | null) => {
    graphRef.current = instance;
    setGraphInstance(instance);
  }, []);

  useEffect(() => {
    const handleResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // CodeRabbit: AbortController for cleanup
    const abortController = new AbortController();
    let isActive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: fetch initialization
    setLoading(true);
    setError(null);

    fetch(
      `/api/articles/${articleId}/relationship-graph?algorithm=embedding&maxNodes=8&minSimilarity=0.25&depth=${currentDepth}`,
      {
        signal: abortController.signal,
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch graph data');
        return res.json();
      })
      .then((data) => {
        if (!isActive) return;
        setGraphData(data);

        // CodexMCP: Create stable map for tooltip lookup (before force-graph mutates links)
        const map = new Map<string, LinkMetadata>();
        data.links.forEach((link: GraphLink) => {
          const targetId =
            typeof link.target === 'string' ? link.target : link.target.id;
          map.set(targetId, {
            similarity: link.value,
            commonTags: link.commonTags,
            type: link.type,
          });
        });
        setLinkMap(map);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return; // CodeRabbit: Ignore abort errors
        if (!isActive) return;
        setError(err);
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
      abortController.abort(); // CodeRabbit: Cleanup on unmount
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
  const centerNode = graphData.nodes.find(
    (n: any) => n.id === graphData.metadata?.centerArticleId
  );

  return (
    // キャンバスは常に暗い配色で描くので、重ねるパネルもダークのトークンに揃える。
    // Portal で body 直下に描く部品（Tooltip など）はこの範囲の外に出るので、足すときは注意
    <div className="dark relative h-screen w-full bg-[var(--tt-color-surface)] scheme-dark">
      <ForceGraph2D
        graphData={graphData}
        ref={handleGraphRef}
        nodeLabel={(node: GraphNode) => {
          // CodexMCP: Use stable map (before force-graph mutation)
          const isCenter = node.id === graphData.metadata?.centerArticleId;
          const linkData = linkMap.get(node.id);
          const commonTags = linkData?.commonTags || 0;
          const similarity = linkData?.similarity
            ? Math.round(linkData.similarity * 100)
            : 0;

          return `
${node.label}

配信: ${formatPublishedDate(node.publishedAt)}
${
  isCenter
    ? '[この記事を中心に関連記事を表示]'
    : `
関連度: ${similarity}%
共通タグ数: ${commonTags}個
カテゴリ: ${node.category}
`
}
${node.summary ? `\n${node.summary.substring(0, 70)}...` : ''}
`.trim();
        }}
        nodeVal="val"
        nodeColor="color"
        nodeCanvasObject={(
          node: GraphNode & { x: number; y: number },
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
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
            ctx.strokeStyle = darkColors.text;
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
                const diffHours = Math.floor(
                  (Date.now() - timestamp) / (1000 * 60 * 60)
                );
                if (diffHours < 24) {
                  ctx.save();
                  const badgeRadius = 6 / globalScale;
                  const badgeOffset = radius * 0.7;
                  ctx.fillStyle = darkColors.negative;
                  ctx.beginPath();
                  ctx.arc(
                    node.x + badgeOffset,
                    node.y - badgeOffset,
                    badgeRadius,
                    0,
                    2 * Math.PI
                  );
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
          const displayLabel = truncateLabel(
            removeCenterPrefix(label),
            maxLength
          );

          // Draw dark outline for readability
          ctx.strokeStyle = darkColors.background;
          ctx.lineWidth = 3 / globalScale;
          ctx.strokeText(displayLabel, node.x, node.y + radius + fontSize);

          // Draw light text
          ctx.fillStyle = darkColors.text;
          ctx.fillText(displayLabel, node.x, node.y + radius + fontSize);
        }}
        linkWidth={(link: GraphLink) => Math.max(link.value ** 2 * 18, 1.5)}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={4}
        onNodeClick={(node: GraphNode) => router.push(node.url)}
        onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
        backgroundColor={darkColors.background}
        linkColor={() => GRAPH_LINK_COLOR}
        // CodexMCP: Layout parameters (supported props only)
        warmupTicks={100}
        cooldownTicks={400}
        d3AlphaDecay={0.008}
        d3VelocityDecay={0.35}
        width={viewport.width}
        height={viewport.height}
      />

      <GraphOverlays
        articleId={articleId}
        currentDepth={currentDepth}
        onToggleDepth={() => setCurrentDepth((d) => (d === 1 ? 2 : 1))}
        centerNode={centerNode}
        relatedCount={graphData.nodes.length - 1}
        hoveredNode={hoveredNode}
        centerArticleId={graphData.metadata?.centerArticleId}
        legendOpen={legendOpen}
        onLegendToggle={setLegendOpen}
      />
    </div>
  );
}
