'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphResponse } from '@/types';
import { cn } from '@/lib/utils';

// Entity type colors
const entityTypeColors: Record<string, string> = {
  person: '#3b82f6',      // blue
  organization: '#8b5cf6', // purple
  location: '#10b981',     // green
  concept: '#f59e0b',      // amber
  product: '#ec4899',      // pink
  event: '#06b6d4',        // cyan
  technology: '#6366f1',   // indigo
  default: '#6b7280',      // gray
};

// Custom node component
function EntityNode({ data }: { data: { label: string; entityType: string; isCenter?: boolean } }) {
  const color = entityTypeColors[data.entityType.toLowerCase()] || entityTypeColors.default;

  return (
    <div
      className={cn(
        'px-4 py-3 bg-surface border rounded-xl shadow-sm min-w-[120px] transition-all',
        data.isCenter ? 'border-2 border-primary shadow-md' : 'border-border-light'
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
            {data.label}
          </span>
          <span className="text-[10px] text-text-tertiary capitalize">
            {data.entityType}
          </span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  entity: EntityNode,
};

interface GraphViewerProps {
  data: GraphResponse | null;
  centerId?: string;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

export function GraphViewer({ data, centerId, onNodeClick, className }: GraphViewerProps) {
  // Convert graph data to React Flow format
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data) return { initialNodes: [], initialEdges: [] };

    const nodeCount = data.nodes.length;
    const angleStep = (2 * Math.PI) / Math.max(nodeCount - 1, 1);
    const radius = Math.max(200, nodeCount * 30);

    const nodes: Node[] = data.nodes.map((node, index) => {
      const isCenter = node.id === centerId;
      let x = 0;
      let y = 0;

      if (isCenter) {
        // Center node at origin
        x = 0;
        y = 0;
      } else {
        // Arrange other nodes in a circle
        const angle = index * angleStep;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      }

      return {
        id: node.id,
        type: 'entity',
        position: { x, y },
        data: {
          label: node.name,
          entityType: node.entity_type,
          isCenter,
        },
      };
    });

    const edges: Edge[] = data.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationship_type.replace(/_/g, ' '),
      labelStyle: { fontSize: 10, fill: '#6b7280' },
      labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      animated: false,
      style: { stroke: '#d1d5db' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#9ca3af',
      },
    }));

    return { initialNodes: nodes, initialEdges: edges };
  }, [data, centerId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes/edges when data changes
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick]
  );

  if (!data || data.nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-surface-secondary rounded-xl', className)}>
        <p className="text-text-tertiary text-sm">No graph data available</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full rounded-xl overflow-hidden border border-border-light', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background color="var(--border-light)" gap={20} size={1} />
        <Controls className="!bg-surface !border-border-light !shadow-sm" />
        <MiniMap
          nodeColor={(node) => {
            const entityType = (node.data as { entityType?: string })?.entityType;
            return entityTypeColors[entityType?.toLowerCase() ?? ''] || entityTypeColors.default;
          }}
          className="!bg-surface !border-border-light"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
