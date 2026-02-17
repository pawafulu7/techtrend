'use client';

import { useMemo, useCallback, useEffect, memo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  Handle,
  Position,
  type NodeProps,
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- Types ---

interface GraphNodeData extends Record<string, unknown> {
  name: string;
  type: string;
  mentionCount: number;
}

interface GraphEdgeData extends Record<string, unknown> {
  relationType: string;
  strength: number;
}

interface TechMapGraphProps {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    mentionCount: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relationType: string;
    strength: number;
  }>;
  onNodeClick: (entityId: string) => void;
  onNodeDoubleClick: (entityId: string) => void;
  hiddenTypes: Set<string>;
  centerId?: string;
}

// --- Color constants ---

const TYPE_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  LANGUAGE: { bg: '#3B82F6', border: '#2563EB', text: '#DBEAFE' },
  FRAMEWORK: { bg: '#8B5CF6', border: '#7C3AED', text: '#EDE9FE' },
  TOOL: { bg: '#10B981', border: '#059669', text: '#D1FAE5' },
  CONCEPT: { bg: '#F59E0B', border: '#D97706', text: '#FEF3C7' },
  PLATFORM: { bg: '#EF4444', border: '#DC2626', text: '#FEE2E2' },
  LIBRARY: { bg: '#14B8A6', border: '#0D9488', text: '#CCFBF1' },
};

const DEFAULT_COLOR = { bg: '#6B7280', border: '#4B5563', text: '#F3F4F6' };

// --- Custom Node ---

function TechEntityNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const colors = TYPE_COLORS[data.type] || DEFAULT_COLOR;
  const size = Math.max(
    40,
    Math.min(100, 40 + Math.sqrt(data.mentionCount) * 4)
  );

  return (
    <div className="flex flex-col items-center" style={{ width: size + 20 }}>
      <Handle
        type="target"
        position={Position.Top}
        className="!border-none !bg-transparent"
      />
      <div
        className="flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
        style={{
          width: size,
          height: size,
          backgroundColor: colors.bg,
          border: `2px solid ${colors.border}`,
        }}
      >
        <span
          className="text-center leading-tight font-medium"
          style={{
            color: colors.text,
            fontSize: Math.max(8, Math.min(12, size / 6)),
            maxWidth: size - 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.name}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: colors.bg }}
        />
        <span className="text-[10px] text-slate-400">
          {data.mentionCount.toLocaleString()}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!border-none !bg-transparent"
      />
    </div>
  );
}

const MemoizedTechEntityNode = memo(TechEntityNode);

// --- Custom Edge ---

function RelationEdge(props: EdgeProps<Edge<GraphEdgeData>>) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  } = props;
  const relationType = data?.relationType || 'INTEGRATES_WITH';
  const strength = data?.strength || 0.5;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  let strokeDasharray: string | undefined;
  let strokeWidth = 1 + strength * 3;

  switch (relationType) {
    case 'DEPENDS_ON':
      // solid
      break;
    case 'ALTERNATIVE':
      strokeDasharray = '5,5';
      break;
    case 'EVOLUTION':
      strokeDasharray = '2,4';
      break;
    case 'PART_OF':
      strokeWidth = 2 + strength * 4;
      break;
    case 'INTEGRATES_WITH':
    default:
      strokeWidth = 1 + strength * 2;
      break;
  }

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: `rgba(148, 163, 184, ${0.3 + strength * 0.5})`,
        strokeWidth,
        strokeDasharray,
      }}
    />
  );
}

const MemoizedRelationEdge = memo(RelationEdge);

// --- Node & Edge type registrations ---

const nodeTypes: NodeTypes = {
  techEntity: MemoizedTechEntityNode,
};

const edgeTypes: EdgeTypes = {
  relation: MemoizedRelationEdge,
};

// --- Layout Helper ---

function layoutNodes(
  apiNodes: TechMapGraphProps['nodes'],
  centerId?: string
): Node<GraphNodeData>[] {
  const centerIndex = centerId
    ? apiNodes.findIndex((n) => n.id === centerId)
    : -1;
  const sortedNodes =
    centerIndex >= 0
      ? [apiNodes[centerIndex], ...apiNodes.filter((_, i) => i !== centerIndex)]
      : [...apiNodes].sort((a, b) => b.mentionCount - a.mentionCount);

  const radius = Math.max(300, sortedNodes.length * 30);

  return sortedNodes.map((node, i) => {
    let x: number;
    let y: number;

    if (i === 0 && centerIndex >= 0) {
      // Center node
      x = 0;
      y = 0;
    } else {
      const adjustedI = centerIndex >= 0 ? i : i + 1;
      const total =
        centerIndex >= 0 ? sortedNodes.length - 1 : sortedNodes.length;
      const angle = (2 * Math.PI * adjustedI) / total - Math.PI / 2;
      const r = radius * (0.6 + Math.random() * 0.4);
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
    }

    return {
      id: node.id,
      type: 'techEntity',
      position: { x, y },
      data: {
        name: node.name,
        type: node.type,
        mentionCount: node.mentionCount,
      },
    };
  });
}

function buildEdges(
  apiEdges: TechMapGraphProps['edges']
): Edge<GraphEdgeData>[] {
  return apiEdges.map((edge, i) => ({
    id: `e-${edge.source}-${edge.target}-${i}`,
    source: edge.source,
    target: edge.target,
    type: 'relation',
    data: {
      relationType: edge.relationType,
      strength: edge.strength,
    },
    markerEnd:
      edge.relationType === 'EVOLUTION'
        ? { type: MarkerType.ArrowClosed, color: 'rgba(148,163,184,0.6)' }
        : undefined,
  }));
}

// --- Main Component ---

export default function TechMapGraph({
  nodes: apiNodes,
  edges: apiEdges,
  onNodeClick,
  onNodeDoubleClick,
  hiddenTypes,
  centerId,
}: TechMapGraphProps) {
  const filteredApiNodes = useMemo(
    () => apiNodes.filter((n) => !hiddenTypes.has(n.type)),
    [apiNodes, hiddenTypes]
  );

  const visibleNodeIds = useMemo(
    () => new Set(filteredApiNodes.map((n) => n.id)),
    [filteredApiNodes]
  );

  const filteredApiEdges = useMemo(
    () =>
      apiEdges.filter(
        (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      ),
    [apiEdges, visibleNodeIds]
  );

  const initialNodes = useMemo(
    () => layoutNodes(filteredApiNodes, centerId),
    [filteredApiNodes, centerId]
  );

  const initialEdges = useMemo(
    () => buildEdges(filteredApiEdges),
    [filteredApiEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when initialNodes/initialEdges change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      onNodeDoubleClick(node.id);
    },
    [onNodeDoubleClick]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-slate-950"
    >
      <Background color="#334155" gap={20} />
      <Controls className="!border-slate-700 !bg-slate-800 !shadow-xl [&>button]:!border-slate-600 [&>button]:!bg-slate-800 [&>button]:!text-white [&>button:hover]:!bg-slate-700" />
      <MiniMap
        nodeColor={(node) => {
          const data = node.data as GraphNodeData;
          return TYPE_COLORS[data.type]?.bg || DEFAULT_COLOR.bg;
        }}
        maskColor="rgba(0, 0, 0, 0.7)"
        className="!border-slate-700 !bg-slate-900"
      />
    </ReactFlow>
  );
}
