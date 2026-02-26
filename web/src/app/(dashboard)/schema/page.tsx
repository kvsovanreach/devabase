'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { useTables, TableInfo, TableColumnInfo } from '@/hooks/use-tables';
import { useCollections } from '@/hooks/use-collections';

// Type for converted collection schema (used in schema visualizer)
interface CollectionSchema {
  name: string;
  row_count: number;
  created_at: string;
  columns: TableColumnInfo[];
}
import {
  GitBranch,
  Table2,
  FolderOpen,
  Key,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Braces,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Calculate node height based on number of columns
function calculateNodeHeight(columnCount: number): number {
  const headerHeight = 40;
  const columnHeight = 28;
  return headerHeight + (columnCount * columnHeight);
}

interface TableNodeData {
  table: TableInfo | CollectionSchema;
  type: 'table' | 'collection';
  foreignKeys?: string[];
}

// Custom node component for tables and collections
function TableNode({ data }: { data: TableNodeData }) {
  const { table, type, foreignKeys = [] } = data;
  const Icon = type === 'table' ? Table2 : FolderOpen;
  const headerBg = type === 'table' ? 'bg-violet-500' : 'bg-primary';

  // Check if a column is a foreign key
  const isForeignKey = (colName: string) => foreignKeys.includes(colName);

  return (
    <div className="bg-surface border border-border-light rounded-lg shadow-lg overflow-hidden min-w-[240px] max-w-[300px] relative">
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-surface"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-surface"
      />

      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center gap-2', headerBg)}>
        <Icon className="w-4 h-4 text-white" />
        <span className="font-semibold text-white text-[13px] truncate flex-1">
          {table.name}
        </span>
        <Badge variant="default" size="sm" className="bg-white/20 text-white border-0">
          {table.row_count}
        </Badge>
      </div>

      {/* Columns - both tables and collection schemas have columns */}
      <div>
        {table.columns.map((col: TableColumnInfo) => (
          <div
            key={col.name}
            className={cn(
              'px-3 py-1.5 flex items-center gap-2 text-[12px] border-b border-border-light last:border-0',
              col.is_primary && 'bg-warning/10',
              isForeignKey(col.name) && 'bg-primary/10'
            )}
          >
            <span className={cn('flex-shrink-0', getTypeColor(col.data_type))}>
              {getTypeIcon(col.data_type)}
            </span>
            <span className={cn(
              'flex-1 truncate',
              col.is_primary ? 'text-warning font-medium' :
              isForeignKey(col.name) ? 'text-primary font-medium' : 'text-foreground'
            )}>
              {col.name}
            </span>
            {col.is_primary && <Key className="w-3 h-3 text-warning flex-shrink-0" />}
            {isForeignKey(col.name) && !col.is_primary && (
              <Link2 className="w-3 h-3 text-primary flex-shrink-0" />
            )}
            <span className="text-text-tertiary font-mono text-[10px] flex-shrink-0">
              {formatDataType(col.data_type)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Map PostgreSQL types to icons
function getTypeIcon(dataType: string) {
  const normalizedType = dataType.toLowerCase();
  if (normalizedType.includes('uuid')) return <Key className="w-3 h-3" />;
  if (normalizedType.includes('int') || normalizedType.includes('numeric') || normalizedType.includes('real') || normalizedType.includes('double'))
    return <Hash className="w-3 h-3" />;
  if (normalizedType.includes('bool')) return <ToggleLeft className="w-3 h-3" />;
  if (normalizedType.includes('json')) return <Braces className="w-3 h-3" />;
  if (normalizedType.includes('time') || normalizedType.includes('date')) return <Calendar className="w-3 h-3" />;
  return <Type className="w-3 h-3" />;
}

function getTypeColor(dataType: string) {
  const normalizedType = dataType.toLowerCase();
  if (normalizedType.includes('uuid')) return 'text-violet-500';
  if (normalizedType.includes('int') || normalizedType.includes('numeric') || normalizedType.includes('real') || normalizedType.includes('double'))
    return 'text-blue-500';
  if (normalizedType.includes('bool')) return 'text-amber-500';
  if (normalizedType.includes('json')) return 'text-rose-500';
  if (normalizedType.includes('time') || normalizedType.includes('date')) return 'text-orange-500';
  if (normalizedType.includes('text') || normalizedType.includes('char') || normalizedType.includes('varchar'))
    return 'text-emerald-500';
  return 'text-text-secondary';
}

function formatDataType(dataType: string) {
  // Shorten common types
  return dataType
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('timestamp without time zone', 'timestamp')
    .replace('double precision', 'float8');
}

// Node types
const nodeTypes = {
  tableNode: TableNode,
};

// Detect foreign key relationships based on column naming conventions
function detectRelationships(tables: TableInfo[]): { edges: Edge[]; foreignKeyMap: Map<string, string[]> } {
  const edges: Edge[] = [];
  const foreignKeyMap = new Map<string, string[]>();
  const tableNames = new Set(tables.map(t => t.name));

  tables.forEach((table) => {
    const fkColumns: string[] = [];

    table.columns.forEach((col) => {
      // Check for common FK patterns: xxx_id, xxxId
      if (col.name.endsWith('_id') && col.data_type.toLowerCase().includes('uuid')) {
        const referencedTableName = col.name.slice(0, -3); // Remove '_id'

        // Try to find matching table (singular or plural forms)
        const possibleNames = [
          referencedTableName,
          referencedTableName + 's',
          referencedTableName + 'es',
          referencedTableName.replace(/y$/, 'ies'),
        ];

        for (const possibleName of possibleNames) {
          if (tableNames.has(possibleName) && possibleName !== table.name) {
            fkColumns.push(col.name);
            edges.push({
              id: `${table.name}-${col.name}-${possibleName}`,
              source: `table-${table.name}`,
              target: `table-${possibleName}`,
              sourceHandle: null,
              targetHandle: null,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#8b5cf6', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#8b5cf6',
                width: 20,
                height: 20,
              },
              label: col.name,
              labelStyle: {
                fill: '#a1a1aa',
                fontSize: 10,
                fontWeight: 500,
              },
              labelBgStyle: {
                fill: '#18181b',
                fillOpacity: 0.9,
              },
              labelBgPadding: [4, 2] as [number, number],
              labelBgBorderRadius: 4,
            });
            break;
          }
        }

        // Special case mappings
        const specialMappings: Record<string, string> = {
          'approved_by': 'employees',
          'approver_id': 'employees',
          'manager_id': 'employees',
          'user_id': 'employees',
          'report_id': 'expense_reports',
          'document_id': 'documents',
        };

        if (specialMappings[col.name] && tableNames.has(specialMappings[col.name])) {
          if (!fkColumns.includes(col.name)) {
            fkColumns.push(col.name);
            edges.push({
              id: `${table.name}-${col.name}-${specialMappings[col.name]}`,
              source: `table-${table.name}`,
              target: `table-${specialMappings[col.name]}`,
              sourceHandle: null,
              targetHandle: null,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#8b5cf6', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#8b5cf6',
                width: 20,
                height: 20,
              },
              label: col.name,
              labelStyle: {
                fill: '#a1a1aa',
                fontSize: 10,
                fontWeight: 500,
              },
              labelBgStyle: {
                fill: '#18181b',
                fillOpacity: 0.9,
              },
              labelBgPadding: [4, 2] as [number, number],
              labelBgBorderRadius: 4,
            });
          }
        }
      }
    });

    foreignKeyMap.set(table.name, fkColumns);
  });

  // Remove duplicate edges (same source-target pair)
  const uniqueEdges = edges.filter((edge, index, self) =>
    index === self.findIndex((e) => e.source === edge.source && e.target === edge.target && e.label === edge.label)
  );

  return { edges: uniqueEdges, foreignKeyMap };
}

// Build relationship graph for layout calculation
interface RelationshipGraph {
  // tableName -> tables it references (outgoing edges)
  references: Map<string, Set<string>>;
  // tableName -> tables that reference it (incoming edges)
  referencedBy: Map<string, Set<string>>;
}

function buildRelationshipGraph(tables: TableInfo[], edges: Edge[]): RelationshipGraph {
  const references = new Map<string, Set<string>>();
  const referencedBy = new Map<string, Set<string>>();

  // Initialize maps
  tables.forEach(t => {
    references.set(t.name, new Set());
    referencedBy.set(t.name, new Set());
  });

  // Build graph from edges
  edges.forEach(edge => {
    const sourceTable = edge.source.replace('table-', '');
    const targetTable = edge.target.replace('table-', '');

    references.get(sourceTable)?.add(targetTable);
    referencedBy.get(targetTable)?.add(sourceTable);
  });

  return { references, referencedBy };
}

// Calculate hierarchical layout - tables flow left to right based on dependencies
function calculateHierarchicalLayout(
  tables: TableInfo[],
  collections: CollectionSchema[],
  showTables: boolean,
  showCollections: boolean,
  foreignKeyMap: Map<string, string[]>,
  edges: Edge[]
): Node[] {
  const nodes: Node[] = [];
  const nodeWidth = 280;
  const horizontalGap = 120;
  const verticalGap = 40;

  if (!showTables || tables.length === 0) {
    // Just show collections in a row
    if (showCollections) {
      collections.forEach((collection, i) => {
        nodes.push({
          id: `collection-${collection.name}`,
          type: 'tableNode',
          position: { x: i * (nodeWidth + horizontalGap), y: 0 },
          data: { table: collection, type: 'collection', foreignKeys: [] },
        });
      });
    }
    return nodes;
  }

  const graph = buildRelationshipGraph(tables, edges);
  const tableMap = new Map(tables.map(t => [t.name, t]));

  // Assign layers using topological sort
  // Layer 0: Root tables (referenced by others but reference nothing or few tables)
  // Higher layers: Tables that reference tables in lower layers
  const layers: string[][] = [];
  const tableLayer = new Map<string, number>();
  const visited = new Set<string>();

  // Calculate layer for each table based on dependencies
  function getLayer(tableName: string, visiting: Set<string> = new Set()): number {
    if (tableLayer.has(tableName)) {
      return tableLayer.get(tableName)!;
    }

    if (visiting.has(tableName)) {
      // Circular dependency, break the cycle
      return 0;
    }

    visiting.add(tableName);

    const refs = graph.references.get(tableName) || new Set();
    if (refs.size === 0) {
      tableLayer.set(tableName, 0);
      return 0;
    }

    let maxRefLayer = -1;
    refs.forEach(ref => {
      if (tableMap.has(ref)) {
        maxRefLayer = Math.max(maxRefLayer, getLayer(ref, visiting));
      }
    });

    const layer = maxRefLayer + 1;
    tableLayer.set(tableName, layer);
    return layer;
  }

  // Calculate layers for all tables
  tables.forEach(t => getLayer(t.name));

  // Group tables by layer
  const maxLayer = Math.max(...Array.from(tableLayer.values()), 0);
  for (let i = 0; i <= maxLayer; i++) {
    layers.push([]);
  }

  tables.forEach(t => {
    const layer = tableLayer.get(t.name) || 0;
    layers[layer].push(t.name);
  });

  // Sort tables within each layer by number of connections (more connected = center)
  layers.forEach(layer => {
    layer.sort((a, b) => {
      const aConnections = (graph.references.get(a)?.size || 0) + (graph.referencedBy.get(a)?.size || 0);
      const bConnections = (graph.references.get(b)?.size || 0) + (graph.referencedBy.get(b)?.size || 0);
      return bConnections - aConnections;
    });
  });

  // Position tables - layers go left to right, tables within layer are stacked vertically
  let xOffset = 0;

  layers.forEach((layer, layerIndex) => {
    // Calculate total height for this layer
    let totalHeight = 0;
    const heights: number[] = [];

    layer.forEach(tableName => {
      const table = tableMap.get(tableName)!;
      const height = calculateNodeHeight(table.columns.length);
      heights.push(height);
      totalHeight += height;
    });

    totalHeight += (layer.length - 1) * verticalGap;

    // Center vertically
    let yOffset = -totalHeight / 2;

    layer.forEach((tableName, indexInLayer) => {
      const table = tableMap.get(tableName)!;
      const height = heights[indexInLayer];

      nodes.push({
        id: `table-${table.name}`,
        type: 'tableNode',
        position: { x: xOffset, y: yOffset },
        data: { table, type: 'table', foreignKeys: foreignKeyMap.get(table.name) || [] },
      });

      yOffset += height + verticalGap;
    });

    xOffset += nodeWidth + horizontalGap;
  });

  // Add collections after tables
  if (showCollections && collections.length > 0) {
    let collectionY = 0;
    collections.forEach((collection) => {
      const height = calculateNodeHeight(collection.columns.length);
      nodes.push({
        id: `collection-${collection.name}`,
        type: 'tableNode',
        position: { x: xOffset, y: collectionY },
        data: { table: collection, type: 'collection', foreignKeys: [] },
      });
      collectionY += height + verticalGap;
    });
  }

  return nodes;
}

// Calculate simple grid layout (fallback)
function calculateGridLayout(
  tables: TableInfo[],
  collections: CollectionSchema[],
  showTables: boolean,
  showCollections: boolean,
  foreignKeyMap: Map<string, string[]>
): Node[] {
  const nodes: Node[] = [];
  const nodeWidth = 280;
  const horizontalGap = 80;
  const verticalGap = 40;
  const cols = 3;

  const items: { item: TableInfo | CollectionSchema; type: 'table' | 'collection' }[] = [];

  if (showTables && tables.length > 0) {
    tables.forEach(table => items.push({ item: table, type: 'table' }));
  }
  if (showCollections && collections.length > 0) {
    collections.forEach(collection => items.push({ item: collection, type: 'collection' }));
  }

  // Calculate row heights
  const rows: { items: typeof items; maxHeight: number }[] = [];
  let currentRow: typeof items = [];

  items.forEach((item, index) => {
    currentRow.push(item);
    if (currentRow.length === cols || index === items.length - 1) {
      const maxHeight = Math.max(...currentRow.map(i =>
        calculateNodeHeight(i.item.columns.length)
      ));
      rows.push({ items: [...currentRow], maxHeight });
      currentRow = [];
    }
  });

  let yOffset = 0;
  rows.forEach(row => {
    row.items.forEach((item, colIndex) => {
      const id = item.type === 'table' ? `table-${item.item.name}` : `collection-${item.item.name}`;
      nodes.push({
        id,
        type: 'tableNode',
        position: { x: colIndex * (nodeWidth + horizontalGap), y: yOffset },
        data: {
          table: item.item,
          type: item.type,
          foreignKeys: item.type === 'table' ? foreignKeyMap.get(item.item.name) || [] : []
        },
      });
    });
    yOffset += row.maxHeight + verticalGap;
  });

  return nodes;
}

export default function SchemaPage() {
  const { data: tables, isLoading: tablesLoading } = useTables();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showTables, setShowTables] = useState(true);
  const [showCollections, setShowCollections] = useState(true);
  const [showRelationships, setShowRelationships] = useState(true);
  const [layout, setLayout] = useState<'hierarchical' | 'grid'>('hierarchical');

  const isLoading = tablesLoading || collectionsLoading;

  // Detect relationships between tables
  const { edges: detectedEdges, foreignKeyMap } = useMemo(() => {
    if (!tables || tables.length === 0) {
      return { edges: [], foreignKeyMap: new Map() };
    }
    return detectRelationships(tables);
  }, [tables]);

  // Convert collections to table-like format
  const collectionSchemas = useMemo(() => {
    if (!collections) return [];
    return collections.map((c) => ({
      name: c.name,
      row_count: c.vector_count,
      created_at: '',
      columns: [
        { name: 'id', data_type: 'uuid', is_nullable: false, is_primary: true, column_default: null },
        { name: 'content', data_type: 'text', is_nullable: false, is_primary: false, column_default: null },
        { name: 'metadata', data_type: 'jsonb', is_nullable: true, is_primary: false, column_default: null },
        { name: 'embedding', data_type: `vector(${c.dimensions})`, is_nullable: false, is_primary: false, column_default: null },
        { name: 'document_id', data_type: 'uuid', is_nullable: true, is_primary: false, column_default: null },
        { name: 'created_at', data_type: 'timestamptz', is_nullable: false, is_primary: false, column_default: null },
      ] as TableColumnInfo[],
    }));
  }, [collections]);

  // Update nodes when data changes
  useEffect(() => {
    if (isLoading) return;

    const tableList = tables || [];
    const collectionList = collectionSchemas;

    const newNodes =
      layout === 'hierarchical'
        ? calculateHierarchicalLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap, detectedEdges)
        : calculateGridLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap);

    setNodes(newNodes);

    // Set edges based on detected relationships
    if (showRelationships && showTables) {
      setEdges(detectedEdges);
    } else {
      setEdges([]);
    }
  }, [tables, collectionSchemas, isLoading, showTables, showCollections, showRelationships, layout, setNodes, setEdges, detectedEdges, foreignKeyMap]);

  const hasNoData = !tables?.length && !collections?.length;

  const handleAutoLayout = () => {
    const tableList = tables || [];
    const collectionList = collectionSchemas;
    const newNodes =
      layout === 'hierarchical'
        ? calculateHierarchicalLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap, detectedEdges)
        : calculateGridLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap);
    setNodes(newNodes);
  };

  const relationshipCount = detectedEdges.length;

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <PageSpinner />
        </div>
      ) : hasNoData ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={<GitBranch className="w-8 h-8" />}
            title="No schema to display"
            description="Create tables or collections to see them visualized here."
          />
        </div>
      ) : (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-light)" />
            <Controls className="!bg-surface !border-border-light !shadow-lg" />
            <MiniMap
              className="!bg-surface !border-border-light"
              nodeColor={(node) => (node.data.type === 'table' ? '#8b5cf6' : '#6366f1')}
              maskColor="rgba(0, 0, 0, 0.2)"
            />

            {/* Control Panel */}
            <Panel position="top-left" className="!m-4">
              <Card className="p-2 space-y-1 min-w-[140px]">
                <Button
                  variant={showTables ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setShowTables(!showTables)}
                  className="w-full justify-start"
                >
                  <Table2 className="w-4 h-4 mr-2" />
                  Tables ({tables?.length || 0})
                </Button>
                <Button
                  variant={showCollections ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setShowCollections(!showCollections)}
                  className="w-full justify-start"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Collections ({collections?.length || 0})
                </Button>

                <div className="border-t border-border-light my-1" />

                <div className="flex gap-1">
                  <Button
                    variant={layout === 'hierarchical' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setLayout('hierarchical')}
                    className="flex-1"
                  >
                    Auto
                  </Button>
                  <Button
                    variant={layout === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setLayout('grid')}
                    className="flex-1"
                  >
                    Grid
                  </Button>
                </div>

                <div className="border-t border-border-light my-1" />

                <Button
                  variant={showRelationships ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setShowRelationships(!showRelationships)}
                  className="w-full justify-start"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  {showRelationships ? 'Hide' : 'Show'} ({relationshipCount})
                </Button>

                <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="w-full justify-start text-text-secondary">
                  Reset Layout
                </Button>
              </Card>
            </Panel>

            {/* Legend */}
            <Panel position="bottom-left" className="!m-4">
              <Card className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-violet-500" />
                    <span>Table</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-primary" />
                    <span>Collection</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Key className="w-3 h-3 text-warning" />
                    <span>Primary Key</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-primary" />
                    <span>Foreign Key</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg width="24" height="12" className="text-violet-500">
                      <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" />
                      <polygon points="24,6 16,2 16,10" fill="currentColor" />
                    </svg>
                    <span>Relationship</span>
                  </div>
                </div>
              </Card>
            </Panel>

            {/* Stats */}
            <Panel position="bottom-right" className="!m-4">
              <Card className="px-3 py-2">
                <div className="flex items-center gap-4 text-[11px] text-text-secondary">
                  <span>
                    <strong className="text-foreground">{tables?.length || 0}</strong> tables
                  </span>
                  <span>
                    <strong className="text-foreground">{collections?.length || 0}</strong> collections
                  </span>
                  <span>
                    <strong className="text-foreground">{relationshipCount}</strong> relationships
                  </span>
                  <span>
                    <strong className="text-foreground">
                      {(tables?.reduce((acc, t) => acc + t.row_count, 0) || 0) +
                        (collections?.reduce((acc, c) => acc + c.vector_count, 0) || 0)}
                    </strong>{' '}
                    records
                  </span>
                </div>
              </Card>
            </Panel>
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
